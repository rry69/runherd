"use client";

import { Card, CardContent } from "@/components/ui/card";

interface KpiCardsProps {
  total: number;
  active: number;
  failed: number;
  queued: number;
  // Agregat token global (GET /api/tokens). null/undefined = DB gagal →
  // kartu disembunyikan (fail-open), bukan angka 0 palsu.
  tokens?: {
    total: number;
    detail?: string;
  } | null;
}

// Angka kompak untuk total besar (153jt → "153.1M"). title=angka penuh.
function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

export function KpiCards({
  total,
  active,
  failed,
  queued,
  tokens,
}: KpiCardsProps) {
  const cardClassName =
    "min-w-0 overflow-hidden rounded-lg border-border bg-card p-3 shadow-none transition-colors hover:bg-accent/60 sm:p-4";
  const cards = [
    {
      label: "Total Sessions",
      value: total.toLocaleString("id-ID"),
      detail: "Total sesi terpantau",
    },
    {
      label: "Active",
      value: active.toLocaleString("id-ID"),
      detail: "Agent sedang berjalan",
    },
    { label: "Failed", value: failed.toLocaleString("id-ID"), detail: "Sesi gagal" },
    { label: "Queued", value: queued.toLocaleString("id-ID"), detail: "Menunggu giliran" },
    ...(tokens
      ? [
          {
            label: "Total Tokens",
            value: compact(tokens.total),
            detail: tokens.detail ?? "Token seluruh sesi",
            title: tokens.total.toLocaleString("id-ID"),
          },
        ]
      : []),
  ];

  return (
    <section
      className={`grid min-w-0 grid-cols-2 gap-2 sm:gap-3 ${tokens ? "md:grid-cols-5" : "md:grid-cols-4"} max-md:[&>*:last-child:nth-child(odd)]:col-span-2`}
      aria-label="Ringkasan sesi"
    >
      {cards.map((card) => (
        <Card key={card.label} className={cardClassName}>
          <CardContent className="p-0">
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p
              className="mt-1 truncate text-lg font-semibold leading-6 tracking-tight tabular-nums sm:mt-2 sm:text-[22px] sm:leading-7"
              title={card.title}
            >
              {card.value}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
