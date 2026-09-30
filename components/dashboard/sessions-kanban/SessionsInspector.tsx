"use client";

import Inspector from "./Inspector";
import type { KanbanCard } from "./types";

type SessionsInspectorProps = {
  card: KanbanCard | null;
  open: boolean;
  onClose: () => void;
};

/** Inspector controlled untuk /sessions (open dikelola page + Escape). */
export function SessionsInspector({ card, open, onClose }: SessionsInspectorProps) {
  return <Inspector item={card} open={open} onClose={onClose} showFab={false} />;
}
