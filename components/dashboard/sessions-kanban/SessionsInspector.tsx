"use client";

import Inspector from "./Inspector";
import type { KanbanCard } from "./types";

type SessionsInspectorProps = {
  card: KanbanCard | null;
  open: boolean;
  onClose: () => void;
};

/** @deprecated tidak dipakai — adapter tipis ke Inspector modal controlled. */
export function SessionsInspector({ card, open, onClose }: SessionsInspectorProps) {
  return <Inspector item={card} open={open} onClose={onClose} />;
}
