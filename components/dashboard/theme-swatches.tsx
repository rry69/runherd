'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  LINEAR_THEMES,
  applyLinearTheme,
  applyStoredLinearTheme,
  resetLinearTheme,
  type LinearTheme,
} from '@/lib/linear-themes';
import { cn } from '@/lib/utils';

function swatchBg(t: LinearTheme): string {
  return `conic-gradient(from 90deg, ${t.bg} 0 34%, ${t.surface} 34% 67%, ${t.accent} 67% 100%)`;
}

export function ThemeSwatches() {
  const [current, setCurrent] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setCurrent(applyStoredLinearTheme()?.name ?? null);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LINEAR_THEMES;
    return LINEAR_THEMES.filter((t) => t.name.toLowerCase().includes(q));
  }, [query]);

  const active = current ? LINEAR_THEMES.find((t) => t.name === current) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? `Tema: ${active.name}. Ganti tema` : 'Ganti tema'}
          title={active ? `Tema: ${active.name}` : 'Ganti tema'}
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card py-1 pl-1.5 pr-2.5 text-[13px] text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
        >
          <span
            aria-hidden="true"
            className="size-5 rounded-full ring-1 ring-border"
            style={{
              background: active
                ? swatchBg(active)
                : 'conic-gradient(from 90deg, #0c0c0e 0 34%, #141416 34% 67%, #5e6ad2 67% 100%)',
            }}
          />
          <span className="max-w-28 truncate font-medium">{active ? active.name : 'Tema'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        data-lenis-prevent
        className="w-[340px] overflow-hidden rounded-xl border-border bg-popover/95 p-1.5 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
      >
        {/* Search ala Linear — menyatu, tanpa border kaku */}
        <div className="mb-1 flex items-center gap-2 rounded-lg bg-muted px-2.5 transition-colors">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari tema…"
            aria-label="Cari tema"
            className="h-9 w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Hapus pencarian"
              className="shrink-0 rounded px-1 text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        {/* Daftar gaya menu Linear: 1 kolom, nama penuh, ceklis di aktif */}
        <div
          role="listbox"
          aria-label="Pilihan tema linear.style"
          data-lenis-prevent
          onWheel={(e) => e.stopPropagation()}
          className="max-h-[300px] overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin] [scrollbar-color:rgba(127,127,127,0.4)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(127,127,127,0.4)] [&::-webkit-scrollbar-track]:bg-transparent"
        >
          {filtered.map((t) => {
            const isActive = t.name === current;
            return (
              <button
                key={t.name}
                type="button"
                role="option"
                aria-selected={isActive}
                title={`${t.name} — ${t.bg} / ${t.surface} / ${t.accent}`}
                aria-label={`Pakai tema ${t.name}`}
                onClick={() => {
                  applyLinearTheme(t);
                  setCurrent(t.name);
                }}
                className={cn(
                  'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-5 shrink-0 rounded-full ring-1 ring-border"
                  style={{ background: swatchBg(t) }}
                />
                <span className="flex-1 truncate font-medium">{t.name}</span>
                {isActive && <Check className="size-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2.5 py-6 text-center text-[13px] text-muted-foreground">
              Tidak ada tema &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between border-t border-border px-2.5 pb-1 pt-2">
          <span className="text-[11px] tabular-nums text-muted-foreground/80">
            {filtered.length} tema
          </span>
          {current ? (
            <button
              type="button"
              onClick={() => {
                resetLinearTheme();
                setCurrent(null);
              }}
              className="text-[11px] font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
            >
              Kembalikan bawaan
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">linear.style</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
