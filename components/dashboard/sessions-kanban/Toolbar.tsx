"use client";

import { KANBAN_CHIPS, type KanbanChip, type KanbanFilter } from "./types";

type ToolbarProps = {
  filter: KanbanFilter;
  agents: string[];
  showing: number;
  total: number;
  onQuery: (q: string) => void;
  onChip: (c: KanbanChip) => void;
  onTab: (t: string) => void;
  onClear: () => void;
};

export default function Toolbar({
  filter,
  agents,
  showing,
  total,
  onQuery,
  onChip,
  onTab,
  onClear,
}: ToolbarProps) {
  return (
    <div className="skan-panel flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input
          value={filter.q}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter alias / title / ID…"
          className="h-9 w-full rounded-full border bg-transparent px-3 text-sm outline-none focus:ring-2 md:w-72"
          style={{ borderColor: "var(--border)" }}
        />
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          {KANBAN_CHIPS.map((c) => (
            <button
              key={c.key}
              data-chip={c.key}
              onClick={() => onChip(c.key)}
              className={`rounded-full border px-3 py-1.5 ${filter.chip === c.key ? "chip-active" : ""}`}
              style={{ borderColor: "var(--border)" }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {/* tab agent dinamis dari data (pengganti swimlane kolom agent) */}
      <div className="flex flex-wrap gap-1.5 text-xs font-bold">
        <button
          data-tab="all"
          onClick={() => onTab("all")}
          className={`rounded-full border px-3 py-1.5 ${filter.tab === "all" ? "tab-active" : ""}`}
          style={{ borderColor: "var(--border)" }}
        >
          All
        </button>
        {agents.map((a) => (
          <button
            key={a}
            data-tab={a}
            onClick={() => onTab(a)}
            className={`rounded-full border px-3 py-1.5 ${filter.tab === a ? "tab-active" : ""}`}
            style={{ borderColor: "var(--border)" }}
          >
            {a}
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        Showing <b>{showing}</b> of <b>{total}</b>
        <button
          onClick={onClear}
          className="ml-2 rounded-full border px-2.5 py-1 font-bold hover:opacity-80"
          style={{ borderColor: "var(--border)" }}
        >
          Clear ✕
        </button>
      </p>
    </div>
  );
}
