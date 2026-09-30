import { assignDisplayNames } from "@/lib/assign-names";
import { getActiveChildren, getSessionCount, getSessions, getTaskHistory } from "@/lib/opencode-db";
import { getOverrides } from "@/lib/overrides";
import type { SessionLiveStatus, SessionLiveWf, SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Rumus live (mirror app/page.tsx 96-104, 170-182):
// - toMs/ageMs sama dengan frontend; STUCK_MS = 5 menit.
// - isThinking = (activeMap[id]?.length ?? 0) > 0
// - stuck = thinking && ageMs > STUCK_MS → status=failed (label stuck di UI)
// - status: thinking ? (stuck ? failed : thinking) : idle
//   (varian queued disederhanakan: non-thinking tanpa override → idle)
// - wf default dari status: thinking/queued→thinking, progress→progress,
//   failed/review→review, idle→done; override final via overrides.workflow[id]
//   bila valid (thinking|progress|review|done).
// - breakdown [aktif%, tool%, idle%] dari tokens activeChildren vs total
//   global; idle → fallback [5,15,80]; thinking tanpa token → [60,25,15].
const STUCK_MS = 5 * 60 * 1000;

function toMs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

const WF_VALUES: ReadonlySet<string> = new Set(["thinking", "progress", "review", "done"]);

function wfForStatus(s: SessionLiveStatus): SessionLiveWf {
  switch (s) {
    case "thinking":
    case "queued":
      return "thinking";
    case "progress":
      return "progress";
    case "failed":
    case "review":
      return "review";
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
    // Kontrak `tasks`: riwayat subagent per sesi top-level (Map id → SubagentTask[]),
    // bertahan setelah task selesai. Fail-open: null → field dihilangkan agar klien sticky.
    // Kontrak live 06: workflow override selalu ikut (murah, dari file);
    // derived hanya bila activeMap ada (fail-open: DB error → active &
    // derived hilang agar klien sticky, bukan auto-idle).
    const workflow: Record<string, string> =
      overrides.workflow && typeof overrides.workflow === "object" ? overrides.workflow : {};
    payload.workflow = workflow;
    const taskMap = getTaskHistory(rows.map((r) => r.id));
    if (taskMap) payload.tasks = Object.fromEntries(taskMap);
    if (activeMap) {
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
        const thinking = children.length > 0;
        const ageMs = Math.max(0, now - toMs(r.time_updated));
        const stuck = thinking && ageMs > STUCK_MS;
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
