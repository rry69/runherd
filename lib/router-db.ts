import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { RouterBreakdown, RouterDaily, RouterStats } from "./types";

// DB 9router. Path ini milik instalasi global npm (9router CLI), bukan bagian
// repo ini, jadi tidak bisa diimpor lewat konstanta bersama dengan
// `lib/opencode-db.ts` - sengaja diduplikasi supaya `router-db.ts` tetap bisa
// dihapus utuh kalau 9router dibongkar.
//
// 9router berjalan sebagai proses terpisah yang SEDANG MENULIS DB ini.
// Pola sama seperti `lib/opencode-db.ts`: readonly + WAL, jadi reader tidak
// memblokir writer dan query SELECT singkat aman. Tidak pernah menulis.
const SRC = String.raw`C:\Users\Hrry\AppData\Roaming\9router\db\data.sqlite`;

// Top-N per breakdown. 9router punya 30+ provider aktif dalam 30 hari; merender
// semua bikin tabel tak terbaca. 10 cukup untuk melihat siapa yang dominan.
const TOP_N = 10;

// Angka dari JSON 9router harus dipertahankan utuh: `cost` adalah REAL hasil
// penjumlahan float (`10.661776235799996` untuk periode 30 hari), jadi cast-nya
// defensif tapi TIDAK membulatkan. `NaN`/`Infinity`/string kosong -> 0 supaya
// aritmetika total tidak tercemar satu nilai rusak.
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Batas bawah `dateKey` untuk `days` hari terakhir, format YYYY-MM-DD.
//
// `dateKey` ditulis 9router dengan tanggal LOKAL mesin yang menjalankannya.
// `toISOString()` memotong ke UTC, jadi memakainya bisa menggeser batas periode
// satu hari (WIB: UTC sudah mundur 7 jam, sehingga baris hari ini belum masuk
// rentang). Karena itu tanggal lokal dipakai langsung, lalu dikurangi satu hari
// per iterasi lewat Date - bukan aritmetika epoch ms yang bisa meleset saat DST.
function sinceKey(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Math.max(0, Math.floor(days)));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function openDb(): Database.Database | null {
  try {
    if (!existsSync(SRC)) return null;
    return new Database(SRC, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

// Akumulator per breakdown. Bentuk `usageDaily.data.byProvider` =
// { "<provider>": { requests, promptTokens, completionTokens, cachedTokens, cost } }
// dan `byModel` = { "<model>|<provider>": { ...sama..., rawModel, provider } }.
type Bucket = {
  requests: number;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
};

function bucketOf(map: Map<string, Bucket>, key: string): Bucket {
  let b = map.get(key);
  if (!b) {
    b = { requests: 0, cost: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
    map.set(key, b);
  }
  return b;
}

function addInto(b: Bucket, v: unknown): void {
  if (typeof v !== "object" || v === null) return;
  const o = v as Record<string, unknown>;
  b.requests += num(o.requests);
  b.cost += num(o.cost);
  b.promptTokens += num(o.promptTokens);
  b.completionTokens += num(o.completionTokens);
  b.cachedTokens += num(o.cachedTokens);
}

// Mask segmen API key (`sk-...`) agar payload /api/router tidak membocorkan
// secret penuh — yang dirender cuma `sk-720eec…f63e14f8|model|provider`.
function maskKey(key: string): string {
  return key
    .split("|")
    .map((seg) => {
      const s = seg.trim();
      if (/^sk-[A-Za-z0-9_-]+$/.test(s) && s.length > 12) {
        return `${s.slice(0, 8)}…${s.slice(-4)}`;
      }
      return seg;
    })
    .join("|");
}

function toRows(map: Map<string, Bucket>, sortBy: "cost" | "requests"): RouterBreakdown[] {
  return [...map.entries()]
    .map(([key, b]) => ({
      key,
      requests: b.requests,
      cost: b.cost,
      promptTokens: b.promptTokens,
      completionTokens: b.completionTokens,
      cachedTokens: b.cachedTokens,
      cacheHit: b.promptTokens > 0 ? (100 * b.cachedTokens) / b.promptTokens : 0,
      costPer1k: b.requests > 0 ? (1000 * b.cost) / b.requests : 0,
    }))
    .sort((a, b) =>
      sortBy === "cost"
        ? b.cost - a.cost || b.requests - a.requests
        : b.requests - a.requests || b.cost - a.cost,
    )
    .slice(0, TOP_N);
}

// Agregat anggaran/token/throughput 9router untuk `days` hari terakhir.
//
// Sumber: tabel `usageDaily` - satu baris per hari, JSON di kolom `data` sudah
// teragregat oleh 9router sendiri. 31 baris = ~1ms (diukur), dan `usageHistory`
// (82rb baris) tidak disentuh sama sekali.
//
// Kenapa tidak `usageHistory`: tidak ada session-id di sana (`meta` kosong di
// semua 82rb baris), jadi biaya per sesi opencode tidak bisa ditelusuri. Yang
// bisa dan MURAH adalah agregat per hari, dan itu sudah tersedia.
//
// Fail-open: DB hilang / terkunci / upgrade 9router ganti skema -> `null`, route
// lalu menghapus field `router` dari payload agar klien mempertahankan angka
// terakhir. Tidak pernah melempar, tidak pernah mengarang 0.
// ponytail: satu konstanta `days` (dipakai route). Tambah pilihan 7/30/90 hanya
// kalau user benar-benar sering berganti periode.
// Resolve local OpenCode combo IDs (`grip`, `cmd`, ...) to the upstream model
// from 9router's own `combos` table (e.g. grip -> `oc/muse-spark-1.3-contributor-free`).
// OpenCode's message.modelID stays the combo alias, so without this the Inspector
// shows `grip` instead of the real model. Single-model combos resolve
// deterministically; multi-model combos (fallback chains like `opencode`) have no
// single upstream model and are left unmapped rather than lying with a guess.
// Prefix (`oc/`, `cmc/`, `muse/`, ...) is the 9router connection tag — stripped,
// keeping the rest (`OP/nvidia/x` -> `nvidia/x`) so namespaced models stay intact.
let comboModelsCache: { at: number; value: Record<string, string> | null } | null = null;
const COMBO_MODELS_TTL_MS = 60_000;

export function getRouterComboModels(): Record<string, string> | null {
  if (comboModelsCache && Date.now() - comboModelsCache.at < COMBO_MODELS_TTL_MS) {
    return comboModelsCache.value;
  }
  const db = openDb();
  if (!db) return null;
  try {
    const rows = db.prepare("SELECT name, models FROM combos").all() as {
      name: string;
      models: string;
    }[];
    const value: Record<string, string> = {};
    for (const r of rows) {
      if (!r?.name) continue;
      let list: unknown;
      try {
        list = JSON.parse(r.models);
      } catch {
        continue;
      }
      if (!Array.isArray(list) || list.length !== 1 || typeof list[0] !== "string") continue;
      const raw = list[0] as string;
      const slash = raw.indexOf("/");
      const stripped = slash >= 0 ? raw.slice(slash + 1) : raw;
      if (stripped) value[r.name] = stripped;
    }
    const out = Object.keys(value).length > 0 ? value : null;
    comboModelsCache = { at: Date.now(), value: out };
    return out;
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {}
  }
}

export function getRouterStats(days = 30): RouterStats | null {
  const db = openDb();
  if (!db) return null;
  try {
    const rows = db
      .prepare("SELECT dateKey, data FROM usageDaily WHERE dateKey >= ? ORDER BY dateKey ASC")
      .all(sinceKey(days)) as { dateKey: string; data: string }[];

    const daily: RouterDaily[] = [];
    const providers = new Map<string, Bucket>();
    const models = new Map<string, Bucket>();
    const apiKeys = new Map<string, Bucket>();
    const endpoints = new Map<string, Bucket>();
    let cost = 0;
    let requests = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let cachedTokens = 0;
    let billableDays = 0;

    for (const row of rows) {
      let d: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(row.data);
        if (typeof parsed !== "object" || parsed === null) continue;
        d = parsed as Record<string, unknown>;
      } catch {
        // Satu hari rusak tidak boleh mematikan total - skip baris itu.
        continue;
      }
      const dayCost = num(d.cost);
      const dayRequests = num(d.requests);
      const dayPrompt = num(d.promptTokens);
      const dayCompletion = num(d.completionTokens);
      // Akar JSON punya `cachedTokens`, dan `byProvider`/`byModel` juga punya
      // `cachedTokens` sendiri. Jangan jumlahkan keduanya ke total root.
      const dayCached = num(d.cachedTokens);

      daily.push({
        date: row.dateKey,
        cost: dayCost,
        requests: dayRequests,
        promptTokens: dayPrompt,
        completionTokens: dayCompletion,
        cachedTokens: dayCached,
      });

      cost += dayCost;
      requests += dayRequests;
      promptTokens += dayPrompt;
      completionTokens += dayCompletion;
      cachedTokens += dayCached;
      if (dayCost > 0) billableDays += 1;

      const byProvider = d.byProvider;
      if (typeof byProvider === "object" && byProvider !== null) {
        for (const [k, v] of Object.entries(byProvider as Record<string, unknown>)) {
          addInto(bucketOf(providers, k), v);
        }
      }
      const byModel = d.byModel;
      if (typeof byModel === "object" && byModel !== null) {
        for (const [k, v] of Object.entries(byModel as Record<string, unknown>)) {
          addInto(bucketOf(models, k), v);
        }
      }
      const byApiKey = d.byApiKey;
      if (typeof byApiKey === "object" && byApiKey !== null) {
        for (const [k, v] of Object.entries(byApiKey as Record<string, unknown>)) {
          addInto(bucketOf(apiKeys, maskKey(k)), v);
        }
      }
      const byEndpoint = d.byEndpoint;
      if (typeof byEndpoint === "object" && byEndpoint !== null) {
        for (const [k, v] of Object.entries(byEndpoint as Record<string, unknown>)) {
          addInto(bucketOf(endpoints, k), v);
        }
      }
    }

    // Tidak ada satu pun hari terbaca = DB ada tapi kosong/selama periode ini.
    // Perlakukan sama seperti DB gagal (null) supaya UI tidak menampilkan
    // zeroes palsu.
    if (daily.length === 0) return null;

    const dayCount = daily.length;
    const last = daily[daily.length - 1];

    return {
      dayCount,
      cost,
      requests,
      promptTokens,
      completionTokens,
      cachedTokens,
      cacheHit: promptTokens > 0 ? (100 * cachedTokens) / promptTokens : 0,
      costPerDay: cost / dayCount,
      requestsPerDay: requests / dayCount,
      costPer1k: requests > 0 ? (1000 * cost) / requests : 0,
      totalTokens: promptTokens + completionTokens,
      // "Hari terakhir yang ADA", bukan `new Date()`: kalau 9router berhenti
      // menulis, `today` harus menunjuk data terakhir, bukan hari kalender
      // kosong yang selalu nol.
      lastDate: last.date,
      todayCost: last.cost,
      todayRequests: last.requests,
      billableDays,
      daily,
      // byProvider disortir cost (kartu anggaran: siapa yang boros),
      // byModel disortir request (throughput: model mana yang paling sering
      // dipanggil). Kolom cost tetap ada di keduanya sehingga user bisa
      // menyortir ulang lewat header tabel.
      byProvider: toRows(providers, "cost"),
      byModel: toRows(models, "requests"),
      byApiKey: toRows(apiKeys, "cost"),
      byEndpoint: toRows(endpoints, "requests"),
    };
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {}
  }
}