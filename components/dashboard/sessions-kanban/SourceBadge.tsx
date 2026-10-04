"use client";

import type { ReactNode } from "react";
import MuiBadge from "@mui/material/Badge";
import { sourceMetaOf } from "./types";

// Badge sumber sesi — MUI Badge (https://mui.com/material-ui/react-badge/)
// dengan badgeContent teks ("opencode", ...).
//
// - Posisi INLINE di samping child (badge `position: static`), bukan
//   floating di pojok — pola floating menutupi pill agent / alias.
// - Warna ikut PALET repo (token CSS `--primary/--accent/--muted`, sama
//   seperti `.badge-*` di kanban.css) — bukan biru hardcoded MUI. Token
//   otomatis beda di light vs dark, tanpa branching tema di JS.
const TONE_SX: Record<string, { background: string; color: string; border: string }> = {
  primary: {
    background: "color-mix(in srgb, var(--primary) 14%, transparent)",
    color: "var(--foreground)",
    border: "1px solid color-mix(in srgb, var(--primary) 40%, transparent)",
  },
  warning: {
    background: "color-mix(in srgb, var(--accent) 22%, transparent)",
    color: "var(--foreground)",
    border: "1px solid color-mix(in srgb, var(--accent) 55%, transparent)",
  },
  secondary: {
    background: "color-mix(in srgb, var(--secondary) 60%, transparent)",
    color: "var(--secondary-foreground)",
    border: "1px solid var(--border)",
  },
  default: {
    background: "var(--muted)",
    color: "var(--muted-foreground)",
    border: "1px solid var(--border)",
  },
};

export default function SourceBadge({ source, children }: { source: string; children: ReactNode }) {
  const meta = sourceMetaOf(source);
  const tone = TONE_SX[meta.color] ?? TONE_SX.secondary;
  return (
    <MuiBadge
      badgeContent={meta.label}
      color={meta.color}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        "& .MuiBadge-badge": {
          position: "static",
          transform: "none",
          marginLeft: "6px",
          fontSize: "10px",
          height: 18,
          minWidth: 18,
          padding: "0 6px",
          borderRadius: 9,
          fontWeight: 700,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          background: tone.background,
          color: tone.color,
          border: tone.border,
        },
      }}
    >
      {children}
    </MuiBadge>
  );
}
