"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { RouterStats } from "@/lib/types";
import { fmt2, fullNum, splitNum } from "@/lib/utils";

export type RouterCardsProps = {
  /** null = DB 9router gagal -> kartu disembunyikan (fail-open), bukan 0 palsu. */
  stats: RouterStats | null;
};

/**
 * Angka besar + pecahan kecil. `prefix` melekat ke bagian bulat, `suffix` ke
 * bagian pecahan. `title` selalu angka TANPA pemisahan — sumber kebenaran
 * kalau user butuh nilai persis untuk disalin.
 *
 * Token/request bisa belasan digit, jadi ukuran font turun mengikuti panjang.
 * Biaya & persen selalu 2 desimal via `decimals={2}`; nilai penuh tetap ada
 * di `title` (hover) sebagai sumber kebenaran untuk disalin.
 */
function BigNumber({
  value,
  prefix = "",
  suffix = "",
  title,
  decimals,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  title?: string;
  decimals?: 2;
}) {
  const s = decimals === 2 ? fmt2(value) : fullNum(value);
  const { head, tail } = splitNum(s);
  const size =
    s.length <= 8
      ? "text-lg sm:text-2xl"
      : s.length <= 12
        ? "text-base sm:text-xl"
        : "text-base sm:text-lg";
  return (
    <p
      className={`font-heading font-extrabold tabular-nums break-all ${size}`}
      title={title ?? `${prefix}${value}${suffix}`}
    >
      {prefix}
      {head}
      {tail && <span className="text-base font-semibold text-muted-foreground">{tail}</span>}
      {suffix}
    </p>
  );
}

/**
 * Empat KPI 9router. Token/request angka penuh; biaya & persen 2 desimal.
 */
export function RouterCards({ stats }: RouterCardsProps) {
  if (!stats) return null;

  const lastLabel = stats.lastDate;
  const costTitle = `$${fmt2(stats.cost)}`;

  const cards: {
    key: string;
    label: string;
    value: ReactNode;
    detail: string;
  }[] = [
    {
      key: "cost",
      label: `Biaya ${stats.dayCount} hari`,
      value: <BigNumber value={stats.cost} prefix="$" title={costTitle} decimals={2} />,
      detail: `${lastLabel}: $${fmt2(stats.todayCost)} · $${fmt2(stats.costPer1k)}/1k req`,
    },
    {
      key: "req",
      label: `Request ${stats.dayCount} hari`,
      value: <BigNumber value={stats.requests} title={`${stats.requests}`} />,
      detail: `${lastLabel}: ${fullNum(stats.todayRequests)} · ${fullNum(stats.requestsPerDay)}/hari`,
    },
    {
      key: "cache",
      label: "Cache hit",
      value: (
        <BigNumber
          value={stats.cacheHit}
          suffix="%"
          title={`${fmt2(stats.cacheHit)}% (${stats.cachedTokens} dari ${stats.promptTokens} prompt)`}
          decimals={2}
        />
      ),
      detail: `${fullNum(stats.cachedTokens)} cached dari ${fullNum(stats.promptTokens)} prompt`,
    },
    {
      key: "token",
      label: `Token ${stats.dayCount} hari`,
      value: <BigNumber value={stats.totalTokens} title={`${stats.totalTokens}`} />,
      detail: `in ${fullNum(stats.promptTokens)} · out ${fullNum(stats.completionTokens)}`,
    },
  ];

  return (
    <section className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4" aria-label="Ringkasan 9router">
      {cards.map((card) => (
        <Card
          key={card.key}
          className="min-w-0 overflow-hidden rounded-lg border-border bg-card p-3 shadow-none sm:p-4"
        >
          <CardContent className="p-0">
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <div className="mt-1">{card.value}</div>
            <p
              className="mt-1 truncate text-[11px] text-muted-foreground"
              title={card.detail}
            >
              {card.detail}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export default RouterCards;