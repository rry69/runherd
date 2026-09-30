// Tipe + pure helpers kanban sessions-06. Port visible()+colOf() dari
// public/mockups/sessions-06-kanban-inspector.html (JS 186-342).
// Semua item diderivasi dari API live (/api/sessions + /api/overrides) —
// tanpa data mock statis.

import type { ActiveChild } from "@/lib/types";

/** Kartu sesi untuk kontrak antar-komponen page (alias item derivasi live). */
export type KanbanCard = KanbanItem;

export type KanbanColumn = "thinking" | "progress" | "review" | "done";

export type KanbanStatus =
  | "thinking"
  | "progress"
  | "review"
  | "done"
  | "queued"
  | "failed"
  | "idle";

export type KanbanChip = "thinking" | "queued" | "failed" | "idle";

export type KanbanFilter = {
  q: string;
  chip: KanbanChip | null;
  tab: string; // "all" | agent key dinamis dari data
  sel: string | null;
};

// Props/item hasil derivasi API live (rows + names + active + overrides).
export type KanbanItem = {
  id: string;
  alias: string;
  title: string;
  agent: string;
  dir: string;
  tokens: number;
  tokensLabel: string;
  ageMs: number;
  ageLabel: string;
  timeUpdated: number;
  status: KanbanStatus;
  col: KanbanColumn;
  activeChildren: ActiveChild[];
  breakdown: [number, number, number];
};

export const KANBAN_COLUMNS: { key: KanbanColumn; label: string; hint: string }[] = [
  { key: "thinking", label: "Thinking", hint: "lattice aktif" },
  { key: "progress", label: "In Progress", hint: "dikerjakan" },
  { key: "review", label: "Review", hint: "butuh verifikasi" },
  { key: "done", label: "Done", hint: "selesai / idle" },
];

export const KANBAN_CHIPS: { key: KanbanChip; label: string }[] = [
  { key: "thinking", label: "● thinking" },
  { key: "queued", label: "◷ queued" },
  { key: "failed", label: "✕ failed" },
  { key: "idle", label: "○ idle/done" },
];

const WF_TO_STATUS: Record<KanbanColumn, KanbanStatus> = {
  thinking: "queued", // dipindah ke thinking tapi belum ada aktivitas = antre
  progress: "progress",
  review: "review",
  done: "idle",
};

/** Status live: thinking bila ada activeChildren, else ikut workflow/alias idle. */
export function liveStatus(activeCount: number, wf?: KanbanColumn | null): KanbanStatus {
  if (activeCount > 0) return "thinking";
  if (wf) return WF_TO_STATUS[wf];
  return "idle";
}

/** Port mock colOf(): queued→thinking, failed→review, idle/done→done. */
export function colOf(status: KanbanStatus, wf?: KanbanColumn | null): KanbanColumn {
  if (status === "queued") return "thinking";
  if (status === "failed") return "review";
  if (status === "idle" || status === "done") return "done";
  return wf ?? status;
}

/** Port mock visible(): query + chip + tab agent. */
export function matchesFilter(item: KanbanItem, f: KanbanFilter): boolean {
  const t = f.q.trim().toLowerCase();
  const okQ =
    !t ||
    `${item.alias} ${item.title} ${item.id} ${item.agent} ${item.dir}`.toLowerCase().includes(t);
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

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
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
