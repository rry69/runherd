"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ActiveChild, SessionNodeData } from "@/lib/types";

// Bentuk anak aktif kanonis dari lib/types (per parentId via /api/sessions {active}).
// Satu child → satu baris part running terbaru: title/agent + tool + umur + token.
export type { ActiveChild } from "@/lib/types";
// Kontrak koordinasi via SessionGraph (tanpa ubah lib/opencode-db.ts):
// SessionGraph mengisi data.alias (overrides > names) / data.hidden /
// data.childCount / data.activeChildren (per parentId dari /api/sessions
// {active}) dan callback data.onRename / data.onDelete / data.onToggle
// saat membangun Node. Tooltip via components/ui/tooltip.tsx (animate).
// Toast Undo 5s + toolbar hidden count dirender SessionGraph dengan
// komponen SessionUndoToast / SessionHiddenToolbar dari file ini.
export type SessionNodeCallbacks = {
  onRename?: (id: string, nextAlias: string) => void;
  onDelete?: (id: string) => void;
  // onToggle opsional (hide/unhide); tanpa expand-click.
  onToggle?: (id?: string) => void;
};

export type SessionNodeDataExt = SessionNodeData & {
  alias?: string;
  hidden?: boolean;
  childCount?: number;
  // Anak aktif per parentId dari /api/sessions {active}; kosong → idle.
  activeChildren?: ActiveChild[];
  isAggregate?: boolean;
} & SessionNodeCallbacks;

type SessionNodeProps = NodeProps<SessionNodeDataExt> & SessionNodeCallbacks;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function formatAge(ageMs: number): string {
  const s = Math.max(0, Math.round(ageMs / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs === 0 ? `${m}m` : `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
}

export function SessionNode(props: SessionNodeProps) {
  const { data, id } = props;
  // Props langsung menang atas data.* (data.* dipakai ReactFlow nodeTypes).
  const onRename = props.onRename ?? data.onRename;
  const onDelete = props.onDelete ?? data.onDelete;
  const onToggle = props.onToggle ?? data.onToggle;

  const displayName = data.alias ?? data.agent ?? "session";
  const childCount = data.childCount ?? 0;
  // activeChildren per parentId dari /api/sessions {active}; kosong → idle.
  const activeChildren = data.activeChildren ?? [];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [confirming, setConfirming] = useState(false);

  // Guard double commit Enter+Blur: Enter memicu commit, blur berikutnya
  // diabaikan. Reset tiap masuk mode edit; Escape menandai consumed
  // agar blur setelah batal tidak ikut commit.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (editing) submittedRef.current = false;
  }, [editing]);

  // Reset mode saat id berganti (tanpa setState-during-render).
  const idRef = useRef(id);
  useEffect(() => {
    if (idRef.current !== id) {
      idRef.current = id;
      setDraft(displayName);
      setEditing(false);
      setConfirming(false);
    }
    // displayName dibaca untuk sinkron nilai awal id baru.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on id change disengaja, sync controlled idiom shadcn
  }, [id]);

  // Sinkron draft saat alias/agent berubah dari luar (mis. Undo rename),
  // hanya saat tidak sedang mengedit agar ketikan user tidak tertimpa.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron draft luar disengaja, guard editing, sync controlled idiom shadcn
    if (!editing) setDraft(displayName);
  }, [displayName, editing]);

  const commitRename = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const next = draft.trim();
    setEditing(false);
    setDraft(next || displayName);
    if (next && next !== displayName) onRename?.(id, next);
  }, [draft, displayName, id, onRename]);

  const cancelRename = useCallback(() => {
    submittedRef.current = true;
    setDraft(displayName);
    setEditing(false);
  }, [displayName]);

  // Normalisasi dua bentuk onToggle: (id) => void dan () => void.
  // Argumen ekstra diabaikan JS bila target closure tanpa param.
  const handleToggle = useCallback(() => {
    onToggle?.(id);
  }, [onToggle, id]);

  const card = (
    <div data-node-id={id}>
      <Card
        className={cn(
          "group relative w-60",
          data.hidden && "opacity-60",
          data.status === "idle" && "opacity-60",
        )}
        data-node-id={id}
      >
        <Handle type="target" position={Position.Top} />
        <CardHeader className="p-3 pb-1">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            {editing ? (
              <Input
                autoFocus
                value={draft}
                aria-label="Nama alias sesi"
                className="nodrag h-7 px-2 text-sm"
                onPointerDown={stop}
                onClick={stop}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                }}
              />
            ) : (
              <span className="truncate" title={displayName}>
                {displayName}
              </span>
            )}
            <span className="flex shrink-0 items-center gap-1">
              <Badge variant={data.status === "active" ? "default" : "secondary"}>
                {data.status}
              </Badge>
              {data.isAggregate && childCount > 0 && (
                <Badge variant="outline">{childCount} sesi</Badge>
              )}
              {data.hidden && <Badge variant="outline">hidden</Badge>}
            </span>
          </CardTitle>
          <div
            className="absolute right-2 top-9 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            onPointerDown={stop}
            onClick={stop}
          >
            <button
              type="button"
              aria-label="Rename session"
              title="Rename"
              className="nodrag rounded border bg-background px-1.5 py-0.5 text-xs hover:bg-accent"
              onClick={() => {
                setConfirming(false);
                setDraft(displayName);
                setEditing((v) => !v);
              }}
            >
              ✏️
            </button>
            <button
              type="button"
              aria-label="Hapus session"
              title="Hapus"
              className="nodrag rounded border bg-background px-1.5 py-0.5 text-xs hover:bg-accent"
              onClick={() => setConfirming((v) => !v)}
            >
              🗑️
            </button>
            {onToggle && (
              <button
                type="button"
                aria-label={data.hidden ? "Tampilkan session" : "Sembunyikan session"}
                title={data.hidden ? "Tampilkan" : "Sembunyikan"}
                className="nodrag rounded border bg-background px-1.5 py-0.5 text-xs hover:bg-accent"
                onClick={handleToggle}
              >
                {data.hidden ? "🙈" : "👁️"}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <p className="truncate text-xs text-muted-foreground" title={data.title}>
            {data.title || data.label}
          </p>
          <p className="mt-1 truncate text-[10px] opacity-60" title={data.directory}>
            {data.directory}
          </p>
          {confirming && (
            <div
              className="nodrag mt-2 rounded-md border p-2 text-xs"
              onPointerDown={stop}
              onClick={stop}
            >
              <p>
                Hapus{childCount > 0 ? ` + ${childCount} anak` : ""}? Aksi cascade.
              </p>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  className="rounded bg-destructive px-2 py-0.5 text-destructive-foreground"
                  onClick={() => {
                    setConfirming(false);
                    onDelete?.(id);
                  }}
                >
                  Ya
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-0.5"
                  onClick={() => setConfirming(false)}
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </CardContent>
        <Handle type="source" position={Position.Bottom} />
      </Card>
    </div>
  );

  if (activeChildren.length === 0) return card;

  return (
    <Tooltip side="bottom">
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent className="w-64 border bg-popover p-2 text-xs text-popover-foreground">
        <ul className="flex flex-col gap-1">
          {activeChildren.map((c) => (
            <li key={c.sessionId} className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{c.title || c.agent}</span>
              <span className="shrink-0 opacity-70">{formatAge(c.ageMs)}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

// Toast Undo 5s — dirender oleh SessionGraph di dekat toolbar/graph.
export function SessionUndoToast({
  message,
  onUndo,
  onClose,
  durationMs = 5000,
}: {
  message: string;
  onUndo: () => void;
  onClose?: () => void;
  durationMs?: number;
}) {
  // Timer stabil: onClose inline dari parent berubah tiap render,
  // jadi disimpan di ref agar tidak mereset timeout terus-menerus.
  // Restart hanya saat message/durationMs berganti (toast baru).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(() => onCloseRef.current?.(), durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs]);

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-lg"
    >
      <span className="truncate">{message}</span>
      <button
        type="button"
        className="rounded bg-primary px-2 py-0.5 text-primary-foreground"
        onClick={onUndo}
      >
        Undo
      </button>
    </div>
  );
}

// Toolbar hidden count — dirender oleh SessionGraph di baris toolbar.
export function SessionHiddenToolbar({
  hiddenCount,
  onShowAll,
}: {
  hiddenCount: number;
  onShowAll: () => void;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs opacity-70">
      {hiddenCount} tersembunyi
      <button
        type="button"
        className="rounded border px-2 py-0.5 hover:bg-accent"
        onClick={onShowAll}
      >
        Tampilkan semua
      </button>
    </span>
  );
}
