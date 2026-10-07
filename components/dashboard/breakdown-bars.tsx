"use client";

import * as React from "react";
import type { ApexOptions } from "apexcharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ApexChart } from "@/components/dashboard/apex-chart";
import { useAccent, useChartPalette } from "@/lib/chart-palette";
import { useIsLightSurface } from "@/hooks/use-is-light-surface";

interface BreakdownBarsProps {
  perAgent: [string, number][];
  perDir: [string, number][];
  total: number;
}

const LEGEND_BASE = {
  show: true,
  position: "bottom" as const,
  fontSize: "11px",
  fontFamily: "inherit",
  markers: { width: 8, height: 8, radius: 8 } as never,
  itemMargin: { horizontal: 8, vertical: 4 },
};

function legendFor(isLight: boolean) {
  return {
    ...LEGEND_BASE,
    labels: { colors: isLight ? "#61616a" : "#8a8a8e" },
  };
}

function shortSeg(s: string, max = 22): string {
  const v = (s ?? "").trim() || "unknown";
  const base = v.split(/[\\/]/).filter(Boolean).pop() ?? v;
  const label = base || v;
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

function AgentBars({ perAgent }: { perAgent: [string, number][] }) {
  const isLight = useIsLightSurface();
  const palette = useChartPalette(Math.max(1, perAgent.length));
  const axis = isLight ? "#61616a" : "#8a8a8e";
  const valueColor = isLight ? "#18181b" : "#e7e7e9";
  const track = isLight ? "#e9e9ee" : "#26262b";
  // Poll 1.5s bikin array baru tiap tick walau isi sama → kunci memo by
  // konten agar options/series stabil, Apex tidak replay animasi (kedip).
  const dataKey = JSON.stringify(perAgent);
  const { series, options } = React.useMemo(() => {
    const max = Math.max(1, ...perAgent.map(([, v]) => v));
    return {
      series: [{ name: "Sesi", data: perAgent.map(([, v]) => v) }],
      options: {
        chart: { type: "bar", toolbar: { show: false }, background: "transparent", foreColor: axis, animations: { enabled: false } },
        theme: { mode: isLight ? "light" : "dark" },
        colors: palette,
        plotOptions: {
          bar: {
            horizontal: true,
            distributed: true,
            borderRadius: 10,
            borderRadiusApplication: "end",
            barHeight: "55%",
            dataLabels: { position: "top" },
          },
        },
        fill: { type: "solid" },
        dataLabels: {
          enabled: true,
          formatter: (v: number) => `${v}`,
          offsetX: 10,
          style: { colors: [valueColor], fontWeight: 700, fontSize: "12px" },
        },
        xaxis: {
          categories: perAgent.map(([name]) => shortSeg(name)),
          max: Math.ceil(max * 1.3),
          labels: { style: { colors: axis, fontSize: "12px" } },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: { labels: { style: { colors: axis, fontSize: "12px" } } },
        grid: { borderColor: track, strokeDashArray: 4, xaxis: { lines: { show: false } } },
        legend: { show: false },
        tooltip: { theme: isLight ? "light" : "dark", y: { formatter: (v: number) => `${v} sesi` } },
      } satisfies ApexOptions,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, axis, valueColor, track, isLight, palette]);
  if (perAgent.length === 0) return <p className="text-xs text-muted-foreground">Belum ada data agent.</p>;
  return (
    <ApexChart
      key={`bars-${palette[0] ?? "na"}-${isLight ? "l" : "d"}`}
      type="bar"
      height={Math.min(360, Math.max(240, perAgent.length * 76 + 60))}
      series={series}
      options={options}
    />
  );
}

function DirDonut({ perDir, total }: { perDir: [string, number][]; total: number }) {
  const isLight = useIsLightSurface();
  const palette = useChartPalette(Math.max(1, perDir.length));
  const accent = useAccent();
  const axis = isLight ? "#61616a" : "#8a8a8e";
  const valueColor = isLight ? "#18181b" : "#e7e7e9";
  const dataKey = JSON.stringify(perDir);
  const { series, options } = React.useMemo(() => {
    return {
      series: perDir.map(([, v]) => v),
      options: {
        chart: { type: "donut", toolbar: { show: false }, background: "transparent", foreColor: axis, animations: { enabled: false } },
        theme: { mode: isLight ? "light" : "dark" },
        colors: palette,
        labels: perDir.map(([name]) => shortSeg(name)),
        legend: legendFor(isLight),
        stroke: { show: true, width: 2, colors: palette },
        fill: { type: "solid" },
        dataLabels: { enabled: false },
        plotOptions: {
          pie: {
            donut: {
              size: "68%",
              labels: {
                show: true,
                name: { show: true, fontSize: "11px", color: axis },
                value: { show: true, fontSize: "28px", fontWeight: 700, color: valueColor },
                total: {
                  show: true,
                  showAlways: true,
                  label: "sesi",
                  fontSize: "12px",
                  color: axis,
                  formatter: () => String(total),
                },
              },
            },
          },
        },
        tooltip: { theme: isLight ? "light" : "dark", y: { formatter: (v: number) => `${v} sesi` } },
      } satisfies ApexOptions,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, axis, valueColor, isLight, palette, total]);
  if (perDir.length === 0) return <p className="text-xs text-muted-foreground">Belum ada data direktori.</p>;
  return <ApexChart key={`donut-${accent}-${isLight ? "l" : "d"}`} type="donut" height={300} series={series} options={options} />;
}

export function BreakdownBars({ perAgent, perDir, total }: BreakdownBarsProps) {
  const [topDirName, topDirValue] = perDir.length > 0 ? perDir[0] : ["—", 0];
  const topDirPct = total > 0 ? Math.round((topDirValue / total) * 100) : 0;
  const isDominant = total > 0 && topDirValue / total > 0.8;

  const cardClassName =
    "overflow-hidden rounded-lg border-border bg-card p-4 shadow-none";

  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <Card className={cardClassName}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-sm font-semibold">Sessions per Agent</h2>
            <p className="text-xs text-muted-foreground">total {total} sesi</p>
          </div>
          <Badge className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {perAgent.length} agents
          </Badge>
        </div>
        <CardContent className="mt-2 p-0 text-sm">
          <AgentBars perAgent={perAgent} />
        </CardContent>
      </Card>

      <Card className={cardClassName}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-sm font-semibold">Sessions per Directory</h2>
            <p className="text-xs text-muted-foreground">total {total} sesi</p>
          </div>
          <Badge className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {perDir.length} dirs
          </Badge>
        </div>
        <CardContent className="mt-2 p-0 text-sm">
          <DirDonut perDir={perDir} total={total} />
          {isDominant && (
            <>
              <div className="mt-2 h-px bg-border" />
              <p className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                {topDirPct}% sesi berjalan di <b className="text-foreground">{topDirName}</b>. Distribusi timpang —
                pertimbangkan split working directory.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
