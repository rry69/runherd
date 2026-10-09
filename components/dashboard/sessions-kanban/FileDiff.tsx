"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// Render patch unified diff per baris, tanpa dep baru.
// `+` emerald, `-` red, `@@` muted bold, konteks abu. Cap render 500 baris.
export function FileDiff({ patch, serverTruncated }: { patch: string; serverTruncated: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const lines = useMemo(() => patch.split("\n"), [patch]);
  const RENDER_CAP = 500;
  const COLLAPSE_AT = 40;
  const visible = showAll ? lines.slice(0, RENDER_CAP) : lines.slice(0, COLLAPSE_AT);
  const cutByRender = lines.length > RENDER_CAP;
  const cutByCollapse = !showAll && lines.length > COLLAPSE_AT;

  if (lines.length === 0 || (lines.length === 1 && !lines[0].trim())) {
    return <p className="font-mono text-[11.5px] text-muted-foreground">Patch tidak tersedia</p>;
  }

  return (
    <div className="min-w-0">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed" aria-label="Patch diff">
        {visible.map((ln, i) => {
          const cls = ln.startsWith("@@")
            ? "font-bold text-muted-foreground"
            : ln.startsWith("+") && !ln.startsWith("+++")
              ? "text-emerald-500"
              : ln.startsWith("-") && !ln.startsWith("---")
                ? "text-red-400"
                : "text-foreground/70";
          return (
            <span key={i} className={cn("block", cls)}>
              {ln || " "}
            </span>
          );
        })}
      </pre>
      {(cutByCollapse || cutByRender || serverTruncated) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {cutByCollapse && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="font-mono text-[11px] text-primary hover:underline"
            >
              Tampilkan semua ({lines.length} baris)
            </button>
          )}
          {showAll && lines.length > COLLAPSE_AT && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="font-mono text-[11px] text-muted-foreground hover:underline"
            >
              Ringkas
            </button>
          )}
          {(cutByRender || serverTruncated) && (
            <span className="font-mono text-[10.5px] text-muted-foreground">(terpotong di server/proses)</span>
          )}
        </div>
      )}
    </div>
  );
}
