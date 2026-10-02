"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Activity, Coins, Gauge, Layers } from "lucide-react";
import { Line, LineChart } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import BorderGlow from "@/components/BorderGlow";
import type { RouterStats } from "@/lib/types";
import { fullNum, splitNum } from "@/lib/utils";

export type RouterCardsProps = {
  /** null = DB 9router gagal -> kartu disembunyikan (fail-open), bukan 0 palsu. */
  stats: RouterStats | null;
};

const NOOP_SUBSCRIBE = () => () => {};

/**
 * Angka besar + pecahan kecil. `prefix` melekat ke bagian bulat, `suffix` ke
 * bagian pecahan. `title` selalu angka TANPA pemisahan — sumber kebenaran
 * kalau user butuh nilai persis untuk disalin.
 *
 * Nilai 9router bisa 18 digit (`10,661776235799996` untuk cost 30 hari), jadi
 * ukuran font turun mengikuti panjang. SEMUA digit tetap dirender; yang
 * dibedakan hanya ukurannya.
 */
function BigNumber({
  value,
  prefix = "",
  suffix = "",
  title,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  title?: string;
}) {
  const s = fullNum(value);
  const { head, tail } = splitNum(s);
  const size =
    s.length <= 8
      ? "text-4xl"
      : s.length <= 12
        ? "text-3xl"
        : s.length <= 15
          ? "text-2xl"
          : "text-xl";
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

function Spark({ data, stroke }: { data: number[]; stroke: string }) {
  // < 2 titik = garis meaningless; duplikasi titik terakhir biar garis
  // horizontal statt redak. Angka SENDIRI tidak diringkas — array number
  // apa adanya.
  const src = data.length >= 2 ? data : [0, 0];
  const points = src.map((v, i) => ({ i, v }));
  return (
    <div aria-hidden="true">
      <LineChart
        width={96}
        height={36}
        data={points}
        margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
      >
        <Line
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}

/**
 * Empat KPI 9router. Angka PENUH — tidak ada `compact()`, tidak ada
 * `toFixed()`, tidak ada pemangkasan digit.
 *
 * Kenapa angka kasar tidak boleh: `cost` 9router adalah REAL hasil penjumlahan
 * float (periode 30 hari = `10.661776235799996`). `toFixed(2)` mengubahnya
 * jadi `10,66` dan menghapus justru informasi yang paling penting: 9 dari 31
 * hari berbiaya nol, sisanya melonjak (`4,605448` di 09-11). Aturan yang sama
 * berlaku untuk token: `2.528.629.799` tidak boleh jadi `2.5B`.
 */
export function RouterCards({ stats }: RouterCardsProps) {
  const { resolvedTheme } = useTheme();
  // `mounted` menggantikan pola useState+useEffect setMounted(true): pola itu
  // memicu error `react-hooks/set-state-in-effect` dan bisa hydration
  // mismatch kalau resolvedTheme sudah dark saat SSR. useSyncExternalStore
  // memberi false→true tanpa efek, persis seperti fullpage-loader.tsx.
  const mounted = useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";
  const cardClassName = isDark
    ? "rounded-2xl border-0 bg-transparent p-5 shadow-none backdrop-blur transition-colors overflow-hidden"
    : "rounded-2xl border border-primary/20 bg-transparent p-5 shadow-none backdrop-blur transition-colors hover:border-primary";
  const cardStyle = isDark
    ? { background: "transparent", borderColor: "transparent" }
    : { background: "transparent" };

  const costSpark = React.useMemo(
    () => (stats?.daily ?? []).map((d) => d.cost),
    [stats],
  );
  const reqSpark = React.useMemo(
    () => (stats?.daily ?? []).map((d) => d.requests),
    [stats],
  );
  const cachedSpark = React.useMemo(
    () => (stats?.daily ?? []).map((d) => d.cachedTokens),
    [stats],
  );
  const tokenSpark = React.useMemo(
    () => (stats?.daily ?? []).map((d) => d.promptTokens + d.completionTokens),
    [stats],
  );

  if (!stats) return null;

  const withGlow = (node: React.ReactNode) => {
    if (!isDark) return node;
    return (
      <BorderGlow
        glowColor="40 80 80"
        backgroundColor="#120F17"
        borderRadius={16}
        glowRadius={40}
        glowIntensity={1.0}
        coneSpread={25}
        animated={false}
        edgeSensitivity={30}
        colors={["#c084fc", "#f472b6", "#38bdf8"]}
        fillOpacity={0.5}
      >
        {node}
      </BorderGlow>
    );
  };

  const lastLabel = stats.lastDate;
  const costTitle = `$${stats.cost}`;

  const cards: {
    key: string;
    icon: React.ReactNode;
    spark: number[];
    stroke: string;
    label: string;
    value: React.ReactNode;
    lines: string[];
  }[] = [
    {
      key: "cost",
      icon: <Coins size={22} strokeWidth={2.2} className="text-foreground" />,
      spark: costSpark,
      stroke: "#059669",
      label: `Biaya ${stats.dayCount} hari`,
      value: <BigNumber value={stats.cost} prefix="$" title={costTitle} />,
      lines: [
        `${lastLabel}: $${stats.todayCost}`,
        `rata-rata $${stats.costPerDay} per hari`,
        `${stats.billableDays} dari ${stats.dayCount} hari berbiaya`,
        `$${stats.costPer1k} per 1.000 request`,
      ],
    },
    {
      key: "req",
      icon: <Gauge size={22} strokeWidth={2.2} className="text-foreground" />,
      spark: reqSpark,
      stroke: "#65a30d",
      label: `Request ${stats.dayCount} hari`,
      value: <BigNumber value={stats.requests} title={`${stats.requests}`} />,
      lines: [
        `${lastLabel}: ${fullNum(stats.todayRequests)}`,
        `rata-rata ${fullNum(stats.requestsPerDay)} per hari`,
        `${fullNum(stats.totalTokens)} token total`,
      ],
    },
    {
      key: "cache",
      icon: <Activity size={22} strokeWidth={2.2} className="text-muted-foreground" />,
      spark: cachedSpark,
      stroke: "#8b5cf6",
      label: "Cache hit",
      value: (
        <BigNumber
          value={stats.cacheHit}
          suffix="%"
          title={`${stats.cacheHit}% (${stats.cachedTokens} dari ${stats.promptTokens} prompt)`}
        />
      ),
      lines: [
        `${fullNum(stats.cachedTokens)} cached`,
        `dari ${fullNum(stats.promptTokens)} prompt`,
      ],
    },
    {
      key: "token",
      icon: <Layers size={22} strokeWidth={2.2} className="text-muted-foreground" />,
      spark: tokenSpark,
      stroke: "#f472b6",
      label: `Token ${stats.dayCount} hari`,
      value: <BigNumber value={stats.totalTokens} title={`${stats.totalTokens}`} />,
      lines: [
        `in ${fullNum(stats.promptTokens)}`,
        `out ${fullNum(stats.completionTokens)}`,
        `cached ${fullNum(stats.cachedTokens)}`,
      ],
    },
  ];

  return (
    <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) =>
        withGlow(
          <Card key={c.key} className={cardClassName} style={cardStyle}>
            <div className="flex items-start justify-between">
              {c.icon}
              <Spark data={c.spark} stroke={c.stroke} />
            </div>
            <CardContent className="mt-4 p-0">
              <p className="text-sm font-medium text-muted-foreground">{c.label}</p>
              {c.value}
              <ul className="mt-2 space-y-0.5">
                {c.lines.map((l) => (
                  <li key={l} className="truncate text-[11px] text-muted-foreground" title={l}>
                    {l}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>,
        ),
      )}
    </section>
  );
}

export default RouterCards;