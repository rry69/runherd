"use client";

import SessionCard from "./SessionCard";
import {
  matchesFilter,
  type KanbanColumn,
  type KanbanFilter,
  type KanbanItem,
} from "./types";

type DoneGridProps = {
  items: KanbanItem[];
  filter: KanbanFilter;
  onSelect: (id: string) => void;
  onMove: (id: string, col: KanbanColumn) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function DoneGrid({ items, filter, onSelect, onMove, onRename, onDelete }: DoneGridProps) {
  const inCol = items.filter((s) => s.col === "done" && matchesFilter(s, filter));
  const totalCol = items.filter((s) => s.col === "done").length;
  return (
    <section
      data-col="done"
      className="rounded-2xl border p-2.5"
      style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 60%, transparent)" }}
    >
      <header
        className="mb-2 flex items-center gap-2 rounded-xl px-2 py-2"
        style={{ border: "1px solid var(--border)", background: "var(--card)" }}
      >
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: "var(--muted-foreground)" }}
          aria-hidden="true"
        />
        <h2 className="text-[15px] font-bold">Done</h2>
        <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
          selesai / idle
        </span>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
          style={{ background: "var(--muted)", color: "var(--foreground)" }}
        >
          {inCol.length}/{totalCol}
        </span>
      </header>
      {inCol.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-5 text-center"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <p className="text-2xl">∅</p>
          <p className="mt-1 text-[15px] font-bold">Kolom kosong</p>
          <p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
            Tidak ada sesi cocok di Done.
          </p>
        </div>
      ) : (
        <div className="grid max-h-[62vh] grid-cols-1 gap-2.5 overflow-y-auto p-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {inCol.map((s) => (
            <SessionCard
              key={s.id}
              item={s}
              selected={filter.sel === s.id}
              onSelect={onSelect}
              onMove={onMove}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
