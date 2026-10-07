"use client";

import type { ApexOptions } from "apexcharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApexChart } from "@/components/dashboard/apex-chart";
import { useAccent } from "@/lib/chart-palette";
import { useIsLightSurface } from "@/hooks/use-is-light-surface";
import type { RouterDaily } from "@/lib/types";

export type RouterTrendProps = {
  daily: RouterDaily[] | null;
};

export function RouterTrend({ daily }: RouterTrendProps) {
  const isLight = useIsLightSurface();
  const accent = useAccent();
  const points = (daily ?? []).slice(-31);
  const gridColor = "rgba(127,127,127,0.35)";
  const axis = isLight ? "#61616a" : "#8a8a8e";
  const options: ApexOptions = {
      chart: {
        type: "area",
        toolbar: { show: false },
        background: "transparent",
        foreColor: axis,
        zoom: { enabled: false },
      },
      theme: { mode: isLight ? "light" : "dark" },
      colors: [accent],
      legend: { show: false },
      stroke: { curve: "smooth", width: 2, colors: [accent] },
      fill: { type: "solid", opacity: 0.25 },
      markers: { size: 0, hover: { size: 4 } },
      grid: { borderColor: gridColor, strokeDashArray: 3 },
      xaxis: {
        type: "datetime",
        categories: points.map((p) => p.date),
        labels: { style: { colors: axis, fontSize: "11px" } },
        axisBorder: { color: gridColor },
        axisTicks: { color: gridColor },
      },
      yaxis: {
        labels: { style: { colors: axis, fontSize: "11px" } },
      },
      tooltip: { theme: isLight ? "light" : "dark", x: { format: "dd MMM yyyy" } },
    };
  const series = [{ name: "request", data: points.map((p) => p.requests) }];

  if (points.length === 0) return null;

  return (
    <Card className="overflow-hidden rounded-lg border-border bg-card shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Request harian</CardTitle>
      </CardHeader>
      <CardContent>
        <ApexChart key={`trend-${accent}-${isLight ? "l" : "d"}`} type="area" height={180} series={series} options={options} />
      </CardContent>
    </Card>
  );
}

export default RouterTrend;
