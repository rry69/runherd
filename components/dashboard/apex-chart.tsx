"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="w-full animate-pulse rounded-md bg-muted"
      style={{ height: 260 }}
    />
  ),
});

export type ApexChartProps = {
  options: ApexOptions;
  // Apex `series` union terlalu longgar untuk radialBar/treemap/area —
  // `unknown[]` cukup, validasi bentuk di tiap pemakai.
  series: unknown[];
  type: "radialBar" | "treemap" | "area" | "polarArea" | "donut" | "bar";
  height?: number | string;
};

/** Wrapper client-only ApexCharts (hindari SSR `window is not defined`). */
export function ApexChart({ options, series, type, height = 260 }: ApexChartProps) {
  return (
    <ReactApexChart
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options={options as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      series={series as any}
      type={type}
      height={height}
    />
  );
}

export default ApexChart;
