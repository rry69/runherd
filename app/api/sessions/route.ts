import { assignDisplayNames } from "@/lib/assign-names";
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
import type { SessionLiveStatus, SessionLiveWf, SessionRow } from "@/lib/types";

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

const WF_VALUES: ReadonlySet<string> = new Set(["thinking", "done"]);

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

export async function GET() {
  try {
    const rows = getSessions();
    // Total SEMUA sesi di DB (bukan rows.length yang limited 200);
    // `count` tetap rows.length untuk konsumen existing.
    const total = getSessionCount();
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
      total,
      data: rows,
      names,
    };
    const activeMap = getActiveChildren(rows.map((r) => r.id));
    if (activeMap) payload.active = Object.fromEntries(activeMap);
    // Kontrak `live`: sesi top-level yang sedang streaming TANPA tool
    // (turn assistant tanpa `$.time.completed`). Melengkapi `active`, yang
    // hanya melihat part running. Fail-open: null → field dihapus agar klien
    // sticky (pertahankan status terakhir), bukan auto-idle.
    const live = getLiveTurns(rows.map((r) => r.id));
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
    const taskMap = getTaskHistory(rows.map((r) => r.id));
    // Thinking main agent: 1 baris per turn assistant completed milik sesi
    // top-level (agent='main', tanpa spawn sub-agent). Fail-open: null → lewati.
    try {
      const mainMap = getMainThinkingHistory(rows.map((r) => r.id));
      if (taskMap && mainMap) {
        for (const [k, list] of mainMap) {
          const cur = taskMap.get(k) ?? [];
          const merged = [...cur, ...list];
          merged.sort((a, b) => {
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
      const toolsMap = getToolHistory(rows.map((r) => r.id));
      if (toolsMap) payload.tools = Object.fromEntries(toolsMap);
    } catch {}
    try {
      const changedMap = getChangedFiles(rows.map((r) => r.id));
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
    return Response.json(payload, { headers: NO_STORE });
  } catch {
    // ok:false agar klien sticky (tidak menimpa rows/active terakhir).
    return Response.json({ ok: false, error: "gagal membaca DB" }, { status: 500, headers: NO_STORE });
  }
}
