"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SessionNodeData } from "@/lib/types";

// Kontrak koordinasi via SessionGraph (tanpa ubah lib/opencode-db.ts):
// SessionGraph mengisi data.alias / data.hidden / data.childCount dan
// callback data.onRename / data.onDelete / data.onToggle saat membangun Node.
// Toast Undo 5s + toolbar hidden count dirender SessionGraph dengan
// komponen SessionUndoToast / SessionHiddenToolbar dari file ini.
export type SessionNodeCallbacks = {
  onRename?: (id: string, nextAlias: string) => void;
  onDelete?: (id: string) => void;
  // Optional id agar kompatibel dua bentuk:
  // - (id: string) => void (kontrak rename/delete style)
  // - () => void (closure SessionGraph: () => toggleNode(r.id))
  // Keduanya assignable ke (id?: string) => void; pemanggilan selalu handleToggle().
  onToggle?: (id?: string) => void;
};

export type SessionNodeDataExt = SessionNodeData & {
  alias?: string;
  hidden?: boolean;
  childCount?: number;
  // Field opsional milik SessionGraph.ExtendedData agar SessionNode
  // bisa dipasang langsung sebagai `nodeTypes = { session: SessionNode }`
  // tanpa error tipe (kelebihan optional tidak merusak assignability).
  collapsed?: boolean;
  hiddenCount?: number;
  hasChildren?: boolean;
} & SessionNodeCallbacks;

type SessionNodeProps = NodeProps<SessionNodeDataExt> & SessionNodeCallbacks;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function SessionNode(props: SessionNodeProps) {
  const { data, id } = props;
  // Props langsung menang atas data.* (data.* dipakai ReactFlow nodeTypes).
  const onRename = props.onRename ?? data.onRename;
  const onDelete = props.onDelete ?? data.onDelete;
  const onToggle = props.onToggle ?? data.onToggle;

  const displayName = data.alias ?? data.agent ?? "session";
  const childCount = data.childCount ?? 0;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sinkron draft saat alias/agent berubah dari luar (mis. Undo rename),
  // hanya saat tidak sedang mengedit agar ketikan user tidak tertimpa.
  useEffect(() => {
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

  return (
    <Card
      className={cn("group relative w-60", data.hidden && "opacity-60")}
      data-node-id={id}
    >
      <Handle type="target" position={Position.Left} />
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
            {data.hidden && <Badge variant="outline">hidden</Badge>}
          </span>
        </CardTitle>
        {/* Hover actions: muncul saat hover/fokus. stopPropagation agar tidak drag node. */}
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
      <Handle type="source" position={Position.Right} />
    </Card>
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
