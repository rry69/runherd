"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThinkingSpinner } from "@/components/ui/thinking-spinner";
import { KANBAN_COLUMNS, type KanbanColumn, type KanbanItem, type KanbanStatus } from "./types";

export function StatusBadge({ status }: { status: KanbanStatus }) {
  if (status === "thinking")
    return (
      <span className="badge-thinking flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold">
        <ThinkingSpinner size={12} />
        thinking
      </span>
    );
  if (status === "queued")
    return (
      <span className="badge-queued shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">
        ◷ queued
      </span>
    );
  if (status === "failed")
    return (
      <span className="badge-failed shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">
        ✕ failed
      </span>
    );
  return (
    <span className="badge-idle shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">○ idle</span>
  );
}

export function cardCls(status: KanbanStatus): string {
  if (status === "thinking") return "card-thinking";
  if (status === "queued") return "card-queued";
  if (status === "failed") return "card-failed";
  if (status === "idle") return "card-idle";
  return "";
}

type SessionCardProps = {
  item: KanbanItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, col: KanbanColumn) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function SessionCard({
  item,
  selected,
  onSelect,
  onMove,
  onRename,
  onDelete,
}: SessionCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ddRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!ddRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  return (
    <article
      data-id={item.id}
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
      className={`session-card group relative w-full cursor-pointer rounded-2xl border p-3 shadow-sm hover:shadow-md ${cardCls(item.status)}${selected ? " card-selected" : ""}`}
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: "var(--muted)", color: "var(--foreground)" }}
        >
          ⌁ {item.agent}
        </span>
        <span className="mono text-[10px]" style={{ color: "var(--muted-foreground)" }}>
          {item.id.slice(0, 8)}
        </span>
        <span className="ml-auto" />
        <StatusBadge status={item.status} />
      </div>
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-bold" title={item.alias}>
          {item.alias}
        </span>
        <span ref={ddRef} className={`dropdown shrink-0${menuOpen ? " open" : ""}`}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="rounded-lg border px-1.5 py-0.5 text-xs hover:opacity-80"
            style={{ borderColor: "var(--border)" }}
            title="Move To"
          >
            ⋯
          </button>
          <span className="menu">
            {KANBAN_COLUMNS.map((cc) => (
              <button
                key={cc.key}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onMove(item.id, cc.key);
                }}
              >
                → Move to {cc.label}
              </button>
            ))}
          </span>
        </span>
      </div>
      <p className="mono mt-0.5 truncate text-xs opacity-70" title={item.title}>
        {item.title}
      </p>
      <p className="mono mt-0.5 truncate text-[10px] opacity-60">
        {item.dir} · {item.tokensLabel} · {item.ageLabel} lalu
      </p>
      {(item.changedFiles?.length ?? 0) > 0 && (
        <p
          className="mono mt-0.5 truncate text-[10px] opacity-70"
          title={(item.changedFiles ?? []).map((f) => f.file).join(", ")}
        >
          {(item.changedFiles ?? []).length} file +
          {(item.changedFiles ?? []).reduce((a, f) => a + (f.source === "patch-list" ? 0 : f.added), 0)} -
          {(item.changedFiles ?? []).reduce((a, f) => a + (f.source === "patch-list" ? 0 : f.deleted), 0)}
        </p>
      )}
      <div className="breakbar mt-2" aria-hidden="true">
        <span style={{ width: `${item.breakdown[0]}%` }} />
        <span style={{ width: `${item.breakdown[1]}%` }} />
        <span style={{ width: `${item.breakdown[2]}%` }} />
      </div>
      {/* aksi hover: edit/delete saja — assign disembunyikan */}
      <div className="skan-actions mt-2 flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRename(item.id);
          }}
          title="Rename/edit"
        >
          Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          title="Hapus"
        >
          Delete
        </Button>
      </div>
    </article>
  );
}
