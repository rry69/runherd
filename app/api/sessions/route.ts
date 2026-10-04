import { assignDisplayNames } from "@/lib/assign-names";
import {
  getHermesActiveChildren,
  getHermesChangedFiles,
  getHermesLiveTurns,
  getHermesMainThinkingHistory,
  getHermesSessionCount,
  getHermesSessions,
  getHermesTaskHistory,
  getHermesToolHistory,
} from "@/lib/hermes-db";
import { isStuck, isThinkingNow, toMs } from "@/lib/live-status";
import {
  getActiveChildren,
  getChangedFiles,
  getChildTokens,
  getChildTools,
  getLiveTurns,
  getMainThinkingHistory,
  getSessionCount,
  getSessions,
  getTaskHistory,
  getToolHistory,
} from "@/lib/opencode-db";
import { getOverrides } from "@/lib/overrides";
import type {
  SessionLiveStatus,
  SessionLiveWf,
  SessionRow,
  SubagentTask,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Rumus live — semua ambang & rumus tinggal di lib/live-status.ts, satu
// sumber tunggal yang dipakai bersama oleh app/page.tsx (beranda),
// components/dashboard/sessions-kanban/types.ts (kanban), dan route ini.
// Tidak ada lagi duplikasi ambang di satu pun layar.
// - status: thinking ? (stuck ? failed : thinking) : idle
//   (varian queued disederhanakan: non-thinking tanpa override → idle)
// - wf default dari status: thinking/queued/failed→thinking, else→done;
//   override final via overrides.workflow[id] bila valid (thinking|done).
// - breakdown [aktif%, tool%, idle%] dari tokens activeChildren vs total
//   global; idle → fallback [5,15,80]; thinking tanpa token → [60,25,15].
//
// Multi-sumber: opencode.db (wajib — gagal → 500) + state.db Hermes
// (fail-open — gagal → dilewati, opencode tetap tersaji). ID kedua DB tak
// pernah bertabrakan (ses_* vs YYYYMMDD_*), jadi merge map per key aman.

const WF_VALUES: ReadonlySet<string> = new Set(["thinking", "done"]);

type SourcedRow = SessionRow & { source: string };

function wfForStatus(s: SessionLiveStatus): SessionLiveWf {
  switch (s) {
    case "thinking":
    case "queued":
    case "failed":
      return "thinking";
    case "idle":
    default:
      return "done";
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// Gabung dua Map<string, V[]> (key lintas sumber tak bertabrakan).
function mergeLists<V>(a: Map<string, V[]> | null, b: Map<string, V[]> | null): Map<string, V[]> | null {
  if (!a) return b;
  if (!b) return a;
  const out = new Map(a);
  for (const [k, list] of b) {
    const cur = out.get(k);
    out.set(k, cur ? [...cur, ...list] : list);
  }
  return out;
}

function mergeMaps<V>(a: Map<string, V> | null, b: Map<string, V> | null): Map<string, V> | null {
  if (!a) return b;
  if (!b) return a;
  return new Map([...a, ...b]);
}

// Cache respons singkat: poll kanban 1s + beranda 1.5s + graph menembak
// endpoint yang sama; tanpa cache, tiap poll = ~18x buka DB 300MB +
// puluhan scan messages (Hermes 52rb baris, kolom JSON besar, parse di
// JS, semua sync = blokir event loop). TTL 2s aman: ambang live 15s/5mnt.
const CACHE_TTL_MS = 2000;
const cache: Record<string, { at: number; body: unknown }> = {};

export async function GET(req: Request) {
  // Mode lite (?lite=1): hanya fields ringan untuk beranda
  // (data/active/live/workflow/total/names). Melewati scan berat
  // tasks/tools/changedFiles/derived yang bikin poll 1.5s menumpuk
  // pada DB 300MB+ (better-sqlite3 sync = blokir event loop).
  const lite = new URL(req.url).searchParams.get("lite") === "1";
  const key = lite ? "lite" : "full";
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Response.json(hit.body, { headers: NO_STORE });
  }
  const store = (body: unknown) => {
    cache[key] = { at: Date.now(), body };
    return Response.json(body, { headers: NO_STORE });
  };
  try {
    const opRows: SourcedRow[] = getSessions().map((r) => ({ ...r, source: "opencode" }));
    // Total SEMUA sesi di DB (bukan rows.length yang limited 200);
    // `count` tetap rows.length untuk konsumen existing.
    const opTotal = getSessionCount();
    // Hermes fail-open: DB hilang/terkunci → lewati tanpa menggagalkan payload.
    // Limit 400: sesi listable Hermes (~240) harus masuk semua agar sesi
    // terbuka yang lama tidak terpotong cap (opencode tetap 200).
    let hermRows: SourcedRow[] = [];
    let hermTotal = 0;
    try {
      hermRows = getHermesSessions(400);
      hermTotal = getHermesSessionCount();
    } catch {
      hermRows = [];
      hermTotal = 0;
    }
    const rows: SourcedRow[] = [...opRows, ...hermRows].sort(
      (a, b) => toMs(b.time_updated) - toMs(a.time_updated),
    );
    const opIds = opRows.map((r) => r.id);
    const hermIds = hermRows.map((r) => r.id);
    const overrides = getOverrides();
    // Nama display in-memory (tanpa write per-poll);
    // persist via POST /api/overrides.
    const auto = assignDisplayNames(
      rows.map((r) => ({ id: r.id, agent: r.agent, parent_id: r.parent_id })),
      overrides.aliases,
    );
    const names: Record<string, string> = {};
    for (const r of rows) names[r.id] = overrides.aliases[r.id] ?? auto[r.id] ?? r.agent;
    // Fail-open: DB error → field `active` dihilangkan agar klien
    // mempertahankan status terakhir (tetap thinking), bukan auto-idle.
    const payload: Record<string, unknown> = {
      ok: true,
      count: rows.length,
      total: opTotal + hermTotal,
      data: rows,
      names,
    };
    let activeMap = getActiveChildren(opIds);
    try {
      activeMap = mergeLists(activeMap, getHermesActiveChildren(hermIds)) ?? activeMap;
    } catch {}
    if (activeMap) payload.active = Object.fromEntries(activeMap);
    // Kontrak `live`: sesi top-level yang sedang streaming TANPA tool
    // (turn assistant tanpa `$.time.completed` / sesi Hermes terbuka).
    // Melengkapi `active`, yang hanya melihat part running. Fail-open: null →
    // field dihapus agar klien sticky (pertahankan status terakhir).
    let live = getLiveTurns(opIds);
    try {
      live = mergeMaps(live, getHermesLiveTurns(hermIds)) ?? live;
    } catch {}
    if (live) payload.live = Object.fromEntries(live);
    // Kontrak `tasks`: riwayat subagent per sesi top-level (Map id → SubagentTask[]),
    // bertahan setelah task selesai. Fail-open: null → field dihilangkan agar klien sticky.
    // Kontrak live 06: workflow override selalu ikut (murah, dari file);
    // derived hanya bila activeMap ada (fail-open: DB error → active &
    // derived hilang agar klien sticky, bukan auto-idle). `derived`
    // sekarang ikut hilang bersama `live` kalau `live` null, supaya
    // tidak pernah mengirim status idle palsu.
    const workflow: Record<string, string> =
      overrides.workflow && typeof overrides.workflow === "object" ? overrides.workflow : {};
    payload.workflow = workflow;
    if (lite) return store(payload);
    let taskMap = getTaskHistory(opIds);
    try {
      taskMap = mergeLists(taskMap, getHermesTaskHistory(hermIds)) ?? taskMap;
    } catch {}
    // Thinking main agent: 1 baris per turn assistant completed milik sesi
    // top-level (agent='main', tanpa spawn sub-agent). Fail-open: null → lewati.
    try {
      let mainMap = getMainThinkingHistory(opIds);
      try {
        mainMap = mergeLists(mainMap, getHermesMainThinkingHistory(hermIds)) ?? mainMap;
      } catch {}
      if (taskMap && mainMap) {
        for (const [k, list] of mainMap) {
          const cur = taskMap.get(k) ?? [];
          const merged = [...cur, ...list];
          merged.sort((a: SubagentTask, b: SubagentTask) => {
            if (a.status !== b.status) return a.status === "running" ? -1 : 1;
            return b.startedAt - a.startedAt;
          });
          taskMap.set(k, merged.slice(0, 50));
        }
      }
    } catch {}
    // Kontrak `tools`: riwayat tool per root (cap 100, sort at DESC).
    // Kontrak `changedFiles`: agregasi file berubah per root (cap 50).
    // Fail-open: null → field dihapus agar klien sticky.
    try {
      const toolsMap = mergeLists(getToolHistory(opIds), getHermesToolHistory(hermIds));
      if (toolsMap) payload.tools = Object.fromEntries(toolsMap);
    } catch {}
    try {
      const changedMap = mergeLists(getChangedFiles(opIds), getHermesChangedFiles(hermIds));
      if (changedMap) payload.changedFiles = Object.fromEntries(changedMap);
    } catch {}
    if (taskMap) {
      try {
        const childIds: string[] = [];
        for (const list of taskMap.values()) {
          for (const t of list) {
            if (t.childSessionId) childIds.push(t.childSessionId);
          }
        }
        let toolsMap: Map<string, string[]> | null = null;
        let tokensMap: Map<string, number> | null = null;
        try {
          toolsMap = getChildTools(childIds);
        } catch {
          toolsMap = null;
        }
        try {
          tokensMap = getChildTokens(childIds);
        } catch {
          tokensMap = null;
        }
        if (toolsMap || tokensMap) {
          for (const list of taskMap.values()) {
            for (const t of list) {
              if (!t.childSessionId) continue;
              if (toolsMap?.has(t.childSessionId)) {
                t.tools = toolsMap.get(t.childSessionId) ?? [];
              }
              const tok = tokensMap?.get(t.childSessionId);
              if (typeof tok === "number") t.tokens = tok;
            }
          }
        }
        payload.tasks = Object.fromEntries(taskMap);
        if (toolsMap) payload.childTools = Object.fromEntries(toolsMap);
        if (tokensMap) payload.childTokens = Object.fromEntries(tokensMap);
      } catch {
        payload.tasks = Object.fromEntries(taskMap);
      }
    }
    // derived butuh kedua sinyal; kalau `live` hilang (DB error) kirim
    // `derived` stale lebih baik daripada status idle palsu — klien yang
    // fail-open retaining last status.
    if (activeMap && live) {
      const now = Date.now();
      let globalTotal = 0;
      for (const list of activeMap.values()) {
        for (const c of list) globalTotal += c.tokens ?? 0;
      }
      const derived: Record<
        string,
        {
          status: SessionLiveStatus;
          wf: SessionLiveWf;
          ageMs: number;
          tool: string | null;
          partType: string;
          tokens: number;
          breakdown: [number, number, number];
        }
      > = {};
      for (const r of rows as SessionRow[]) {
        const children = activeMap.get(r.id) ?? [];
        // thinking = ada proses running (part) ATAU turn streaming tanpa tool.
        const liveAt = live.get(r.id) ?? 0;
        const thinking = isThinkingNow(children.length, liveAt);
        const ageMs = Math.max(0, now - toMs(r.time_updated));
        const stuck = isStuck(r.time_updated, children.length, liveAt, now);
        const status: SessionLiveStatus = thinking ? (stuck ? "failed" : "thinking") : "idle";
        let wf = wfForStatus(status);
        const ov = workflow[r.id];
        if (typeof ov === "string" && WF_VALUES.has(ov)) wf = ov as SessionLiveWf;
        const tokens = children.reduce((a, c) => a + (c.tokens ?? 0), 0);
        const newest = children[0] ?? null;
        const tool = newest?.tool ?? null;
        const partType = newest?.partType ?? "";
        let breakdown: [number, number, number];
        if (!thinking) {
          breakdown = [5, 15, 80];
        } else if (globalTotal > 0 && tokens > 0) {
          const a = clamp(Math.round((100 * tokens) / globalTotal), 10, 80);
          const toolTok = children
            .filter((c) => c.tool != null)
            .reduce((s, c) => s + (c.tokens ?? 0), 0);
          // porsi tool dari sisa (100-a) proporsional token ber-tool;
          // bila token 0 semua, pakai proporsi count ber-tool.
          const toolFrac =
            tokens > 0
              ? toolTok / tokens
              : children.filter((c) => c.tool != null).length / children.length;
          const t = clamp(Math.round((100 - a) * (Number.isFinite(toolFrac) ? toolFrac : 0)), 0, 100 - a);
          breakdown = [a, t, 100 - a - t];
        } else {
          breakdown = [60, 25, 15];
        }
        derived[r.id] = { status, wf, ageMs, tool, partType, tokens, breakdown };
      }
      payload.derived = derived;
    }
    return store(payload);
  } catch {
    // ok:false agar klien sticky (tidak menimpa rows/active terakhir).
    return Response.json({ ok: false, error: "gagal membaca DB" }, { status: 500, headers: NO_STORE });
  }
}
