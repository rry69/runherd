// Tipe + pure helpers kanban sessions. Semua item diderivasi dari API live
// (/api/sessions + /api/overrides) — tanpa data mock statis.

import type { ActiveChild, SubagentTask, TokenSession } from "@/lib/types";
import { isStuck, isThinkingNow, LIVE_ORPHAN_MS } from "@/lib/live-status";

// Re-export: konsumen lama (termasuk komentar rujukan di app/api/sessions/route.ts)
// mengimpor dari sini; nilai tunggal tetap milik lib/live-status.ts.
export { LIVE_ORPHAN_MS };

/** Kartu sesi untuk kontrak antar-komponen page (alias item derivasi live). */
export type KanbanCard = KanbanItem;

export type KanbanColumn = "thinking" | "done";

export type KanbanStatus = "thinking" | "queued" | "failed" | "idle" | "done";

export type KanbanChip = "thinking" | "queued" | "failed" | "idle";

// Sumber sesi — baris dari opencode.db ("opencode") + state.db Hermes ("hermes").
// Bentuk union + string agar siap multi-sumber (9router/manual/...) tanpa refactor.
export type SessionSource = "opencode" | "hermes" | "9router" | "manual" | (string & {});

export const SOURCE_META: Record<string, { label: string; color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error" }> = {
  opencode: { label: "opencode", color: "primary" },
  hermes: { label: "hermes", color: "success" },
  "9router": { label: "9router", color: "warning" },
  manual: { label: "manual", color: "default" },
};

export function sourceMetaOf(source: string | null | undefined): { label: string; color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error" } {
  const key = (source ?? "opencode").trim().toLowerCase() || "opencode";
  return SOURCE_META[key] ?? { label: key, color: "secondary" };
}

export type KanbanFilter = {
  q: string;
  chip: KanbanChip | null;
  tab: string; // "all" | agent key dinamis dari data
  sel: string | null;
};

export type KanbanToolEvent = {
  sessionId: string;
  tool: string;
  status: string;
  at: number;
  filePath: string | null;
  detail: string | null;
  durationMs: number | null;
  origin: string;
  agent: string;
};

export type KanbanChangedFile = {
  file: string;
  added: number;
  deleted: number;
  source: string;
};

// Peta root session id → total token subtree (dari GET /api/tokens,
// poll 60s terpisah — bukan 1s — karena agregat full-scan message).
export type SessionTokenMap = Record<string, TokenSession>;

// Props/item hasil derivasi API live (rows + names + active + overrides).
export type KanbanItem = {
  id: string;
  alias: string;
  title: string;
  agent: string;
  source: SessionSource;
  dir: string;
  tokens: number;
  tokensLabel: string;
  // Total token SELURUH sesi (root + subagent, dari bySession).
  // null = belum ada data (fetch gagal / sesi tanpa pesan) → UI sembunyikan,
  // bukan angka 0 palsu. `tokens` (live) tidak diubah agar breakdown utuh.
  totalTokens: number | null;
  totalTokensLabel: string | null;
  totalTokensIn: number | null;
  totalTokensOut: number | null;
  // true = totalTokens berasal dari fallback live Σ tasks[].tokens
  // (poll 2s, semua provider) karena bySession (/api/tokens, poll 60s,
  // hanya providerID='opencode') belum ada — mis. sesi baru / 9router.
  // false/null = akumulasi bySession resmi. Dipakai tooltip pill header.
  totalTokensLive: boolean;
  ageMs: number;
  ageLabel: string;
  // Umur fase AKTIF (bukan umur sesi) — dari turn live bila tidak ada part
  // running, karena `time_updated` beku saat model berpikir.
  activeForMs: number;
  timeUpdated: number;
  status: KanbanStatus;
  col: KanbanColumn;
  activeChildren: ActiveChild[];
  liveSince: number;
  tasks: SubagentTask[];
  breakdown: [number, number, number];
  toolHistory: KanbanToolEvent[];
  changedFiles: KanbanChangedFile[];
};

export const KANBAN_COLUMNS: { key: KanbanColumn; label: string; hint: string }[] = [
  { key: "thinking", label: "Thinking", hint: "loader aktif" },
  { key: "done", label: "Done", hint: "selesai / idle" },
];

export const KANBAN_CHIPS: { key: KanbanChip; label: string }[] = [
  { key: "thinking", label: "● thinking" },
  { key: "queued", label: "◷ queued" },
  { key: "failed", label: "✕ failed" },
  { key: "idle", label: "○ idle/done" },
];

export const WF_TO_STATUS: Record<KanbanColumn, KanbanStatus> = {
  thinking: "queued",
  done: "idle",
};

/**
 * Status live kartu sesi — MUSTAHIL divergen dari app/page.tsx dan
 * app/api/sessions/route.ts: pakai `isThinkingNow()` + `isStuck()` yang sama.
 * - `isThinkingNow` (ada part running ATAU turn streaming) →
 *   `isStuck(...) ? "failed" : "thinking"`. `isStuck` memilih ambang sendiri:
 *   5m untuk part running (STUCK_MS), 15m untuk turn live saja (LIVE_ORPHAN_MS).
 * - selain itu → ikut workflow override, default idle.
 *
 * `timeUpdated` harus `row.time_updated` mentah (bukan 0): `isStuck` →
 * `activeForMs` → `toMs(timeUpdated)` hanya dibaca saat `activeCount > 0`,
 * jadiTIAKTIF berarti ambang part-running (5m) tidak pernah terpakai.
 * `now` dikirim dari pemanggil (state now = Date.now() per poll) supaya
 * fungsi ini pure dan tidak memanggil Date.now() di dalam render.
 */
export function liveStatus(
  activeCount: number,
  liveSince: number,
  timeUpdated: number,
  now: number,
  wf?: KanbanColumn | string | null,
): KanbanStatus {
  if (isThinkingNow(activeCount, liveSince)) {
    return isStuck(timeUpdated, activeCount, liveSince, now) ? "failed" : "thinking";
  }
  if (wf) {
    const w = wf === "progress" || wf === "review" ? "done" : wf;
    return WF_TO_STATUS[w as KanbanColumn] ?? "idle";
  }
  return "idle";
}

/** OptB 2-kolom: queued→thinking, failed→thinking, idle/done→done, legacy progress/review→done, fallback wf??"done". */
export function colOf(
  status: KanbanStatus | string,
  wf?: KanbanColumn | string | null,
): KanbanColumn {
  if (status === "thinking" || status === "queued" || status === "failed") return "thinking";
  if (status === "idle" || status === "done" || status === "progress" || status === "review")
    return "done";
  const w = wf === "progress" || wf === "review" ? "done" : wf;
  return (w as KanbanColumn) ?? "done";
}

/** Port mock visible(): query + chip + tab agent. */
export function matchesFilter(item: KanbanItem, f: KanbanFilter): boolean {
  const t = f.q.trim().toLowerCase();
  const okQ =
    !t ||
    `${item.alias} ${item.title} ${item.id} ${item.agent} ${item.source} ${item.dir}`.toLowerCase().includes(t);
  const okC =
    !f.chip ||
    item.status === f.chip ||
    (f.chip === "idle" && (item.status === "idle" || item.status === "done"));
  const okT = f.tab === "all" || item.agent === f.tab;
  return okQ && okC && okT;
}

export function normTs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

export function formatAge(ageMs: number): string {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Durasi task subagent dari `durationMs` (ms, sudah ms). null = masih jalan. */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}j ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
}

/**
 * Fallback live Opsi A: Σ tasks[].tokens (step-finish, semua provider,
 * poll 2s) untuk header sesi aktif saat bySession (/api/tokens, poll 60s,
 * hanya providerID='opencode') belum ada — mis. sesi baru / 9router.
 * Main-thinking (childSessionId null, tokens null) otomatis dilewati.
 * null = tak ada satu pun task bertoken → UI sembunyikan, bukan 0 palsu.
 */
export function sessionLiveTotal(tasks: SubagentTask[]): number | null {
  let sum = 0;
  let any = false;
  for (const t of tasks) {
    if (typeof t.tokens === "number") {
      sum += t.tokens;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Total sesi bisa jutaan (2.8M) — format kompak M/k. title=angka penuh. */
export function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `${n}`;
}

/** Breakdown live dari tokens + jumlah child aktif (bukan statis). */
export function deriveBreakdown(tokens: number, activeCount: number): [number, number, number] {
  if (activeCount > 0) {
    const a = Math.min(80, 30 + activeCount * 8 + Math.min(25, Math.floor(tokens / 500)));
    const t = Math.min(90 - a, 15 + Math.min(30, Math.floor(tokens / 800)));
    return [a, t, 100 - a - t];
  }
  return [5, 10, 85];
}

/**
 * Jenis task subagent dinamis dari `agent` (subagent_type DB).
 * Hanya mengenali nama generik yang stabil; SELAIN itu → "unknown".
 * Sengaja TIDAK hardcode nama kustom (memory/reviewer/scout/dll) agar
 * kontrak jujur: tipe baru dari DB tetap tampil sebagai unknown, bukan
 * hilang atau salah label.
 */
export type TaskKind = "general" | "explore" | "explorer" | "build" | "unknown";

const KNOWN_TASK_KINDS: ReadonlySet<string> = new Set(["general", "explore", "explorer", "build"]);

export function taskKindOf(agent: string | null | undefined): TaskKind {
  const a = (agent ?? "").trim().toLowerCase();
  if (KNOWN_TASK_KINDS.has(a)) return a as TaskKind;
  return "unknown";
}
