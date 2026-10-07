import { ThemeSwatches } from '@/components/dashboard/theme-swatches';

interface HeroStripProps {
  total: number;
  active: number;
}

export function HeroStrip({ total, active }: HeroStripProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Overview
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Selamat pagi, Harry
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Semua agent terpantau <span className="px-1 text-muted-foreground/60">·</span>
          <span className="tabular-nums">{total}</span> sesi
        </p>
      </div>
      <div className="flex w-fit flex-wrap items-center gap-2">
        <ThemeSwatches />
        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-emerald-600/20 bg-emerald-600/[0.08] px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
          <span className="tabular-nums">{active}</span> aktif
        </div>
      </div>
    </header>
  );
}
