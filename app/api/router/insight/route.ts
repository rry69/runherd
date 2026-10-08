import { getSessionCount, getTokenStats } from "@/lib/opencode-db";
import { getRouterStats } from "@/lib/router-db";
import {
  buildOpencodeSummary,
  buildUnifiedFallback,
  buildUnifiedPrompt,
  type OpencodeSummary,
  type UnifiedSnapshot,
} from "@/lib/router-insight";
import type { RouterStats } from "@/lib/types";

export const dynamic = "force-dynamic";

// Snapshot gabungan ringan (opencode + 9router) + cache TTL 45s keyed by
// `days` (seperti /api/tokens & /api/router). Tanpa scan berat:
// getTokenStats = satu-satunya full-scan message (~5.7k baris);
// count = COUNT ringan. Cold ≤2s, warm <200ms + waktu LLM.
//
// Fail-open: opencode gagal → null + label jujur di prompt & fallback,
// bukan 0 palsu. Hanya 9router yang wajib (gagal → 500). Hermes sengaja
// dikecualikan — DB-nya sering hilang/lock.
const SNAP_TTL_MS = 45_000;
const snapCache = new Map<number, { at: number; snap: UnifiedSnapshot; elapsedMs: number }>();

type SourceFlags = { opencode: boolean };

function collectSnapshot(days: number): { snap: UnifiedSnapshot; elapsed: Record<string, number>; sources: SourceFlags } {
  const t0 = Date.now();
  const elapsed: Record<string, number> = {};
  const sources: SourceFlags = { opencode: false };
  const router = getRouterStats(days);
  elapsed.routerMs = Date.now() - t0;
  if (!router) throw new Error("gagal membaca DB 9router");
  const snap: UnifiedSnapshot = { router, opencode: null };
  let op: OpencodeSummary | null = null;
  try {
    const t1 = Date.now();
    const tokenStats = getTokenStats();
    let count: number | null = null;
    try {
      count = getSessionCount();
    } catch {
      count = null;
    }
    elapsed.opencodeMs = Date.now() - t1;
    if (tokenStats) {
      op = buildOpencodeSummary(tokenStats, count);
      sources.opencode = true;
    }
  } catch {
    op = null;
  }
  snap.opencode = op;
  return { snap, elapsed, sources };
}

// POST /api/router/insight — server-only. Key 9router TIDAK PERNAH ke klien:
// dibaca dari env NINE_ROUTER_API_KEY di sini saja. Tanpa key -> fallback
// template deterministik (bukan error kosong) agar kartu tetap berguna.
//
// Body opsional: { days?: number } (default 30, clamp 1..90).
//
// Urutan coba model bisa dioverride lewat env:
// - NINE_ROUTER_MODELS="opencode,cmd,..." (dipakai sesuai urutan)
// - NINE_ROUTER_MODEL="..." (satu model, ditaruh paling depan; kompatibel lama)
//
// Kenapa rantai semua combo: hasil diagnosa 2026-10-08/09 — tiap combo punya
// penyakit sendiri dan bisa berubah kapan saja di sisi upstream:
// - grip (oc/muse-spark-1.3-contributor-free): SELALU 200 + finish "in_progress"
//   + content kosong (prompt pendek/panjang, stream/non-stream). Combo mati.
// - cmd (cmc/...): model penalaran — budget 400 token habis untuk bernalar
//   (finish=length, konten kosong); perlu 1000.
// - claude-tess (nemotron via openrouter): BISA, tapi kuota sangat kecil +
//   body ditempeli residu SSE "data: [DONE]" (perlu parseLenient).
// - codebuddy: 404 no credentials; infoapi: 400 balance=0; uno: 503;
//   openrouter: overload; deepseek: 404 no credentials.
// Jadi: ambil daftar combo HIDUP dari GET /models (owned_by=combo), urutkan
// sesuai preferensi (kuota besar/gratis dulu, terbatas/mati belakangan),
// combo baru yang belum dikenal otomatis ikut dicoba. Gagal cepat -> lanjut
// ke berikut; sukses pertama dipakai. Tanpa key -> fallback angka.
//
// Timeout 60s per model: gagal yang menggantung tidak boleh menahan rantai
// terlalu lama (total 9 model worst-case tetap menit; klien diberi 300s).
// Budget token 4000: model penalaran (termasuk big-pickle) menghabiskan
// ratusan–ribuan token bernalar sebelum menulis konten — 1000 token masih
// terpotong (finish=length, kosong). Rantai hanya dipakai sesekali per klik,
// jadi biaya token bukan masalah.
const MODEL_TIMEOUT_MS = Number(process.env.NINE_ROUTER_MODEL_TIMEOUT_MS ?? "") || 60_000;
const MAX_TOKENS = 4000;
// Utama: combo opencode (terbukti stabil untuk prompt panjang, gratis limit
// besar), lalu big-pickle langsung sebagai cadangan (cepat untuk prompt
// pendek, tapi lambat/flaky untuk prompt panjang), lalu sisanya.
// claude-tess terakhir karena kuota nemotron sangat kecil & flaky.
const MODEL_PREFERENCE = (process.env.NINE_ROUTER_MODELS ??
  "opencode,oc/big-pickle,deepseek,codebuddy,cmd,uno,infoapi,openrouter,grip,claude-tess"
)
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s !== "");
const BASE_URL = process.env.NINE_ROUTER_BASE_URL ?? "http://localhost:20128/v1";

type ChatMessage = {
  content?: unknown;
  reasoning_content?: unknown;
  tool_calls?: unknown;
  refusal?: unknown;
};

type ChatChoice = {
  message?: ChatMessage;
  finish_reason?: string | null;
};

type ChatResponse = {
  choices?: ChatChoice[];
  error?: unknown;
};

// Kode error mesin (stabil untuk UI) + pesan manusia. `detail` hanya untuk
// log server / diagnostik, TIDAK dikirim utuh ke klien (bisa memuat
// potongan body upstream).
type CodedError = Error & { code: string; detail?: string };

function coded(code: string, message: string, detail?: string): CodedError {
  const e = new Error(message) as CodedError;
  e.code = code;
  e.detail = detail;
  return e;
}

// Ekstrak teks dari respons OpenAI-compatible. Melempar CodedError dengan
// kode spesifik bila bukan narasi yang bisa dipakai.
function extractText(json: ChatResponse): { text: string; finish: string | null } {
  const choices = json.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    if (json.error !== undefined) {
      throw coded(
        "UPSTREAM_ERROR",
        "upstream menolak request",
        `envelope error: ${JSON.stringify(json.error).slice(0, 200)}`,
      );
    }
    throw coded("NO_CHOICES", "upstream tidak mengembalikan choices", "choices kosong/hilang");
  }
  const first = choices[0];
  const msg = first?.message;
  const finish = first?.finish_reason ?? null;
  if (!msg) {
    throw coded("NO_MESSAGE", "upstream tidak mengembalikan message", `finish_reason=${finish}`);
  }
  if (typeof msg.content === "string" && msg.content.trim() !== "") {
    return { text: msg.content.trim(), finish };
  }
  if (typeof msg.refusal === "string" && msg.refusal !== "") {
    throw coded("REFUSAL", "upstream menolak menjawab (refusal)", `refusal=${msg.refusal.slice(0, 200)} finish=${finish}`);
  }
  // 9router untuk model gratis tertentu (terbukti: grip) menjawab 200 dengan
  // finish_reason="in_progress" + content="" — generasi tidak pernah selesai
  // di jalur non-stream. Bukan salah parser, upstream memang kosong.
  if (finish === "in_progress") {
    throw coded(
      "UPSTREAM_IN_PROGRESS",
      "upstream mengembalikan respons belum selesai (in_progress) dengan konten kosong",
      "finish_reason=in_progress, content kosong",
    );
  }
  if (typeof msg.reasoning_content === "string" && msg.reasoning_content.trim() !== "") {
    throw coded(
      "REASONING_ONLY",
      "upstream hanya mengembalikan reasoning tanpa narasi",
      `finish=${finish} reasoning_len=${msg.reasoning_content.length}`,
    );
  }
  if (msg.tool_calls !== undefined && msg.tool_calls !== null) {
    throw coded(
      "TOOL_CALLS_ONLY",
      "upstream mengembalikan tool-call tanpa teks",
      `finish=${finish} tool_calls=${JSON.stringify(msg.tool_calls).slice(0, 200)}`,
    );
  }
  throw coded(
    "EMPTY_CONTENT",
    "respons LLM kosong",
    `finish=${finish} msgkeys=${Object.keys(msg).join("+")}`,
  );
}

// JSON.parse toleran: beberapa combo (claude-tess) menempelkan residu SSE
// ("data: [DONE]") di ekor body sehingga res.json() melempar. Ambil objek
// JSON top-level pertama lewat pindai brace seimbang yang sadar
// string/escape, lalu parse potongannya.
function parseLenient(raw: string): ChatResponse {
  const text = raw.trim();
  const asObj = (s: string): ChatResponse => {
    const v: unknown = JSON.parse(s);
    if (typeof v !== "object" || v === null) throw new Error("not-object");
    return v as ChatResponse;
  };
  try {
    return asObj(text);
  } catch {
    // lanjut ke ekstraksi brace seimbang
  }
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no-json");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return asObj(text.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced-json");
}

async function callModel(
  model: string,
  prompt: string,
  apiKey: string,
  timeoutMs: number,
): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: MAX_TOKENS,
          temperature: 0.3,
        }),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw coded("TIMEOUT", `timeout ${timeoutMs / 1000}s menunggu ${model}`, "AbortError");
      }
      throw coded(
        "FETCH_FAILED",
        `gagal menghubungi ${BASE_URL}`,
        e instanceof Error ? e.message : String(e),
      );
    }
    if (!res.ok) {
      const snippet = (await res.text().catch(() => "")).slice(0, 200);
      throw coded(
        `HTTP_${res.status}`,
        `9router HTTP ${res.status}`,
        `model=${model} body=${snippet}`,
      );
    }
    let json: ChatResponse;
    try {
      json = parseLenient(await res.text());
    } catch {
      throw coded("BAD_JSON", "respons upstream bukan JSON valid", `model=${model}`);
    }
    return extractText(json).text;
  } finally {
    clearTimeout(to);
  }
}

type ModelEntry = { id?: unknown; owned_by?: unknown };

// Daftar combo yang sedang hidup menurut 9router sendiri (GET /models,
// entri owned_by="combo"). null bila gateway tak bisa ditanya — pemanggil
// lalu memakai daftar preferensi apa adanya.
async function listLiveCombos(apiKey: string): Promise<string[] | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${BASE_URL}/models`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    const arr =
      typeof body === "object" && body !== null && Array.isArray((body as { data?: unknown }).data)
        ? ((body as { data: unknown }).data as ModelEntry[])
        : null;
    if (!arr) return null;
    const combos = arr
      .filter((m) => m.owned_by === "combo" && typeof m.id === "string" && m.id !== "")
      .map((m) => m.id as string);
    return combos.length > 0 ? combos : null;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

// Urutan coba mengikuti preferensi, dengan yang masih hidup didahulukan:
// ID upstream langsung (berisi "/", mis. oc/big-pickle) bukan combo
// sehingga tak bisa dicek di daftar live — selalu dianggap hidup agar
// posisinya di preferensi dihormati. Lalu combo hidup lain yang belum
// dikenal (otomatis ikut), lalu sisa preferensi (mana tahu hidup lagi).
function resolveModels(live: string[] | null): string[] {
  const pref = [...MODEL_PREFERENCE];
  const single = (process.env.NINE_ROUTER_MODEL ?? "").trim();
  if (single !== "" && !pref.includes(single)) pref.unshift(single);
  if (!live) return pref;
  const liveSet = new Set(live);
  const inLive = pref.filter((m) => m.includes("/") || liveSet.has(m));
  const unknown = live.filter((m) => !pref.includes(m));
  const dead = pref.filter((m) => !m.includes("/") && !liveSet.has(m));
  return [...inLive, ...unknown, ...dead];
}

export async function POST(req: Request) {
  const noStore = { "Cache-Control": "no-store" };
  let days = 30;
  try {
    const body: unknown = await req.json().catch(() => null);
    if (typeof body === "object" && body !== null) {
      const d = (body as Record<string, unknown>).days;
      if (typeof d === "number" && Number.isFinite(d)) {
        days = Math.min(90, Math.max(1, Math.floor(d)));
      }
    }
  } catch {
    // body rusak -> pakai default 30, jangan gagal
  }

  let snap: UnifiedSnapshot;
  let stats: RouterStats;
  let sources: SourceFlags;
  try {
    const hit = snapCache.get(days);
    if (hit && Date.now() - hit.at < SNAP_TTL_MS) {
      snap = hit.snap;
      stats = snap.router;
      sources = { opencode: snap.opencode != null };
      console.error(`[router/insight] snapshot cache hit (days=${days} ambil=${hit.elapsedMs}ms)`);
    } else {
      const t0 = Date.now();
      const collected = collectSnapshot(days);
      snap = collected.snap;
      stats = snap.router;
      sources = collected.sources;
      const elapsedMs = Date.now() - t0;
      snapCache.set(days, { at: Date.now(), snap, elapsedMs });
      console.error(
        `[router/insight] snapshot fresh (days=${days} total=${elapsedMs}ms ` +
          `router=${collected.elapsed.routerMs ?? -1}ms ` +
          `opencode=${collected.elapsed.opencodeMs ?? -1}ms ` +
          `src=opencode:${sources.opencode ? "ok" : "null"})`,
      );
    }
  } catch {
    return Response.json(
      { ok: false, error: "gagal membaca DB 9router" },
      { status: 500, headers: noStore },
    );
  }

  const apiKey = process.env.NINE_ROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        ok: true,
        source: "fallback",
        insight: buildUnifiedFallback(snap),
        error: "NINE_ROUTER_API_KEY belum diset — menampilkan ringkasan angka",
        days: stats.dayCount,
        lastDate: stats.lastDate,
        sources,
      },
      { headers: noStore },
    );
  }

  const prompt = buildUnifiedPrompt(snap);
  const live = await listLiveCombos(apiKey);
  const models = resolveModels(live);
  console.error(`[router/insight] urutan coba: ${models.join(",")} (live=${live ? live.join(",") : "tak-terbaca"})`);
  const tried: string[] = [];
  let lastErr: unknown = null;
  for (const model of models) {
    tried.push(model);
    try {
      const text = await callModel(model, prompt, apiKey, MODEL_TIMEOUT_MS);
      return Response.json(
        {
          ok: true,
          source: "llm",
          insight: text,
          model,
          tried,
          days: stats.dayCount,
          lastDate: stats.lastDate,
          sources,
        },
        { headers: noStore },
      );
    } catch (e) {
      lastErr = e;
      const code = e instanceof Error ? (e as CodedError).code : undefined;
      const detail = e instanceof Error ? ((e as CodedError).detail ?? e.message) : String(e);
      console.error(`[router/insight] ${model} gagal (${code}): ${detail} — lanjut berikut`);
    }
  }
  // Semua model gagal -> template angka + kode error terakhir yang spesifik.
  {
    const e = lastErr;
    const code = e instanceof Error && (e as CodedError).code ? (e as CodedError).code : "LLM_GAGAL";
    const msg = e instanceof Error ? e.message : "LLM gagal";
    const detail = e instanceof Error ? (e as CodedError).detail : undefined;
    console.error(`[router/insight] gagal total (tried=${tried.join(",")} code=${code}): ${detail ?? msg}`);
    return Response.json(
      {
        ok: true,
        source: "fallback",
        insight: buildUnifiedFallback(snap),
        error: `LLM gagal (${msg}) — menampilkan ringkasan angka`,
        code,
        tried,
        days: stats.dayCount,
        lastDate: stats.lastDate,
        sources,
      },
      { headers: noStore },
    );
  }
}
