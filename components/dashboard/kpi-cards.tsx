"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Clock, Coins, LayoutGrid, Users, XCircle } from "lucide-react";
import { Line, LineChart } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import BorderGlow from "@/components/BorderGlow";

interface KpiCardsProps {
  total: number;
  active: number;
  failed: number;
  queued: number;
  activeDetail?: string;
  failedDetail?: string;
  history?: { total: number[]; active: number[]; failed: number[]; queued: number[] };
  // Agregat token global (GET /api/tokens). null/undefined = DB gagal →
  // kartu disembunyikan (fail-open), bukan angka 0 palsu.
  tokens?: {
    total: number;
    detail?: string;
    daily?: number[];
    topModels?: { model: string; total: number }[];
  } | null;
}

// Angka kompak untuk total besar (153jt → "153.1M"). title=angka penuh.
function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

function toPoints(arr: number[]): { i: number; v: number }[] {
  return arr.map((v, i) => ({ i, v }));
}

function Spark({
  data,
  current,
  stroke,
  id,
}: {
  data: number[];
  current: number;
  stroke: string;
  id: string;
}) {
  const src = data.length >= 2 ? data : [current, current];
  const points = toPoints(src);
  void id;
  const n = points.length;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const W = 96;
  const H = 36;
  const P = 4;
  const lastIdx = n - 1;
  const lastX = n <= 1 ? W / 2 : P + (lastIdx / (n - 1)) * (W - P * 2);
  let lastY = H / 2;
  if (n > 1 && max !== min) {
    lastY = P + (1 - (vs[lastIdx] - min) / (max - min)) * (H - P * 2);
  }
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
        <circle
          cx={lastX}
          cy={lastY}
          r={3}
          fill={stroke}
          stroke="#fff"
          strokeWidth={1.5}
        />
      </LineChart>
    </div>
  );
}

export function KpiCards({
  total,
  active,
  failed,
  queued,
  activeDetail,
  failedDetail,
  history,
  tokens,
}: KpiCardsProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const failedRate = total > 0 ? ((failed / total) * 100).toFixed(1) : "0.0";
  const isDark = mounted && resolvedTheme === "dark";

  const cardClassName = isDark
    ? "rounded-2xl border-0 bg-transparent p-5 shadow-none backdrop-blur transition-colors overflow-hidden"
    : "rounded-2xl border border-primary/20 bg-transparent p-5 shadow-none backdrop-blur transition-colors hover:border-primary";
  const cardStyle = isDark
    ? { background: "transparent", borderColor: "transparent" }
    : { background: "transparent" };

  const withGlow = (node: ReactNode) => {
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

  return (
    <section
      className={`grid gap-6 sm:grid-cols-2 ${tokens ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}
    >
      {withGlow(
        <Card className={cardClassName} style={cardStyle}>
          <div className="flex items-start justify-between">
            <LayoutGrid
              size={22}
              strokeWidth={2.2}
              className="text-foreground"
            />
            <Spark data={history?.total ?? []} current={total} stroke="#059669" id="total" />
          </div>
          <CardContent className="mt-4 p-0">
            <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
            <p className="font-heading text-4xl font-extrabold">{total}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total seluruh sesi terpantau</p>
          </CardContent>
        </Card>
      )}

      {withGlow(
        <Card className={cardClassName} style={cardStyle}>
          <div className="flex items-start justify-between">
            <Users size={22} strokeWidth={2.2} className="text-foreground" />
            <Spark data={history?.active ?? []} current={active} stroke="#65a30d" id="active" />
          </div>
          <CardContent className="mt-4 p-0">
            <p className="text-sm font-medium text-muted-foreground">Active Agents</p>
            <p className="font-heading text-4xl font-extrabold">{active}</p>
            <p className="mt-1 text-xs text-muted-foreground">{activeDetail ?? "Agent sedang berjalan"}</p>
          </CardContent>
        </Card>
      )}

      {withGlow(
        <Card className={cardClassName} style={cardStyle}>
          <div className="flex items-start justify-between">
            <XCircle
              size={22}
              strokeWidth={2.2}
              className="text-muted-foreground"
            />
            <Spark data={history?.failed ?? []} current={failed} stroke="#64748b" id="failed" />
          </div>
          <CardContent className="mt-4 p-0">
            <p className="text-sm font-medium text-muted-foreground">Failed</p>
            <p className="font-heading text-4xl font-extrabold">{failed}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {failedDetail ?? `${failedRate}% error rate`}
            </p>
          </CardContent>
        </Card>
      )}

      {withGlow(
        <Card className={cardClassName} style={cardStyle}>
          <div className="flex items-start justify-between">
            <Clock
              size={22}
              strokeWidth={2.2}
              className="text-muted-foreground"
            />
            <Spark data={history?.queued ?? []} current={queued} stroke="#94a3b8" id="queued" />
          </div>
          <CardContent className="mt-4 p-0">
            <p className="text-sm font-medium text-muted-foreground">Queued</p>
            <p className="font-heading text-4xl font-extrabold">{queued}</p>
            <p className="mt-1 text-xs text-muted-foreground">Menunggu giliran eksekusi</p>
          </CardContent>
        </Card>
      )}

      {tokens &&
        withGlow(
          <Card className={cardClassName} style={cardStyle}>
            <div className="flex items-start justify-between">
              <Coins
                size={22}
                strokeWidth={2.2}
                className="text-muted-foreground"
              />
              <Spark
                data={tokens.daily ?? []}
                current={tokens.total}
                stroke="#8b5cf6"
                id="tokens"
              />
            </div>
            <CardContent className="mt-4 p-0">
              <p className="text-sm font-medium text-muted-foreground">Total Tokens</p>
              <p
                className="font-heading text-4xl font-extrabold tabular-nums"
                title={tokens.total.toLocaleString("id-ID")}
              >
                {compact(tokens.total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tokens.detail ?? "Token seluruh sesi"}
              </p>
              {tokens.topModels && tokens.topModels.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {tokens.topModels.slice(0, 3).map((m) => (
                    <li
                      key={m.model}
                      className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                    >
                      <span className="truncate font-mono">{m.model}</span>
                      <span className="shrink-0 tabular-nums">{compact(m.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
    </section>
  );
}
