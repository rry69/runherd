"use client";

import { SearchXIcon } from "lucide-react";

/** Empty state custom untuk tabel dashboard: ikon + judul + petunjuk. */
export function DataTableEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SearchXIcon className="size-4" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
