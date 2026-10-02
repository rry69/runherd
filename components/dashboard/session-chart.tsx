"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import BorderGlow from "@/components/BorderGlow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SessionRow } from "@/lib/types";

export type SessionChartProps = {
  rows: SessionRow[];
  /** Batasi top-N kategori per chart. Default 8. */
  limit?: number;
};

type CountPoint = { name: string; count: number };

function topCounts(rows: SessionRow[], key: (r: SessionRow) => string, limit: number): CountPoint[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r) || "unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function shortName(s: string, max = 18): string {
  const v = (s ?? "").trim() || "unknown";
  // Untuk directory: tampilkan segmen terakhir agar sumbu-X tetap terbaca.
  const base = v.split(/[\\/]/).filter(Boolean).pop() ?? v;
  const label = base || v;
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

function fullName(v: unknown): string {
  const s = String(v ?? "unknown");
  return s.trim() || "unknown";
}

export function SessionChart({ rows, limit = 8 }: SessionChartProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isGlow = mounted && resolvedTheme === "dark";
  const cardCls = isGlow
    ? "border-0 bg-transparent backdrop-blur transition-colors rounded-2xl overflow-hidden"
    : "border border-primary/20 bg-transparent shadow-none backdrop-blur transition-colors hover:border-primary";
  const glowProps = {
    glowColor: "40 80 80",
    backgroundColor: "#120F17",
    borderRadius: 16,
    glowRadius: 40,
    glowIntensity: 1.0,
    coneSpread: 25,
    animated: false,
    edgeSensitivity: 30,
    colors: ["#c084fc", "#f472b6", "#38bdf8"],
    fillOpacity: 0.5,
  };
  const wrap = (node: React.ReactNode) =>
    isGlow ? <BorderGlow {...glowProps}>{node}</BorderGlow> : node;
  // Agregasi sama seperti app/page.tsx:43-52 (perAgent/perDir).
  const agentData = React.useMemo(
    () => topCounts(rows, (r) => r.agent || "unknown", limit),
    [rows, limit],
  );
  const dirData = React.useMemo(
    () => topCounts(rows, (r) => r.directory || "unknown", limit),
    [rows, limit],
  );

  const agentConfig = React.useMemo<ChartConfig>(
    () => ({ count: { label: "jumlah sesi", color: "var(--primary)" } }),
    [],
  );
  const dirConfig = React.useMemo<ChartConfig>(
    () => ({ count: { label: "jumlah sesi", color: "var(--ring)" } }),
    [],
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {wrap(
        <Card className={cardCls}>
        <CardHeader>
          <CardTitle className="text-sm">Distribusi sesi per-agent (top 8 kategori)</CardTitle>
          <p className="text-xs text-muted-foreground">Jumlah per kategori, bukan tren waktu.</p>
        </CardHeader>
        <CardContent>
          {agentData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <ChartContainer config={agentConfig} className="h-[220px] w-full sm:h-[260px]">
              <AreaChart data={agentData} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="sess-agent-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => shortName(String(v))}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval="preserveStartEnd"
                  angle={-16}
                  dy={8}
                  height={44}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  width={36}
                />
                <ChartTooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_v, payload) =>
                        fullName(payload?.[0]?.payload?.name)
                      }
                      formatter={(value) => (
                        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                          <span className="text-muted-foreground">jumlah sesi</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {Number(value).toLocaleString("id-ID")}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="jumlah sesi"
                  stroke="var(--color-count)"
                  fill="url(#sess-agent-fill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
        </Card>
      )}

      {wrap(
        <Card className={cardCls}>
        <CardHeader>
          <CardTitle className="text-sm">Distribusi sesi per-directory (top 8 kategori)</CardTitle>
          <p className="text-xs text-muted-foreground">Jumlah per kategori, bukan tren waktu.</p>
        </CardHeader>
        <CardContent>
          {dirData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <ChartContainer config={dirConfig} className="h-[220px] w-full sm:h-[260px]">
              <AreaChart data={dirData} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="sess-dir-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => shortName(String(v))}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval="preserveStartEnd"
                  angle={-16}
                  dy={8}
                  height={44}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  width={36}
                />
                <ChartTooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_v, payload) =>
                        fullName(payload?.[0]?.payload?.name)
                      }
                      formatter={(value) => (
                        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                          <span className="text-muted-foreground">jumlah sesi</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {Number(value).toLocaleString("id-ID")}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="jumlah sesi"
                  stroke="var(--color-count)"
                  fill="url(#sess-dir-fill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SessionChart;
