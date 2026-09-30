"use client";

import SessionCard from "./SessionCard";
import {
  KANBAN_COLUMNS,
  matchesFilter,
  type KanbanColumn,
  type KanbanFilter,
  type KanbanItem,
} from "./types";

type BoardProps = {
  items: KanbanItem[];
  filter: KanbanFilter;
  onSelect: (id: string) => void;
  onMove: (id: string, col: KanbanColumn) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

function ColDot({ col }: { col: KanbanColumn }) {
  if (col === "thinking") return <span className="think-dot" aria-hidden="true" />;
  if (col === "progress")
    return (
      <span
        className="inline-block size-2 rounded-full"
        style={{ background: "var(--ring)" }}
        aria-hidden="true"
      />
    );
  if (col === "review")
    return (
      <span
        className="inline-block size-2 rounded-full"
        style={{ background: "var(--accent)" }}
        aria-hidden="true"
      />
    );
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ background: "var(--muted-foreground)" }}
      aria-hidden="true"
    />
  );
}

export default function Board({ items, filter, onSelect, onMove, onRename, onDelete }: BoardProps) {
  return (
    <div className="col-scroll flex items-start gap-3 overflow-x-auto pb-3">
      {KANBAN_COLUMNS.map((c) => {
        const inCol = items.filter((s) => s.col === c.key && matchesFilter(s, filter));
        const totalCol = items.filter((s) => s.col === c.key).length;
        return (
          <section
            key={c.key}
            data-col={c.key}
            className="w-72 shrink-0 rounded-2xl border p-2.5 sm:w-80"
            style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 60%, transparent)" }}
          >
            <header
              className="sticky-col-head mb-2 flex items-center gap-2 rounded-xl px-2 py-2 backdrop-blur"
              style={{ border: "1px solid var(--border)", background: "var(--card)" }}
            >
              <ColDot col={c.key} />
              <h2 className="text-sm font-bold">{c.label}</h2>
              <span className="text-[10px] font-semibold" style={{ color: "var(--muted-foreground)" }}>
                {c.hint}
              </span>
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ background: "var(--muted)", color: "var(--foreground)" }}
              >
                {inCol.length}
              </span>
            </header>
            <div className="flex max-h-[62vh] flex-col gap-2.5 overflow-y-auto p-0.5">
              {inCol.length === 0 && (
                <div
                  className="rounded-xl border border-dashed p-5 text-center"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <p className="text-2xl">∅</p>
                  <p className="mt-1 text-xs font-bold">Kolom kosong</p>
                  <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    Tidak ada sesi cocok di {c.label}.
                  </p>
                </div>
              )}
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
            <p className="px-2 pt-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              {inCol.length} / {totalCol} di kolom ini
            </p>
          </section>
        );
      })}
    </div>
  );
}
