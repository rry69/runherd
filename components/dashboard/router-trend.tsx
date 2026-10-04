"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  createDataTableColumnHelper,
  useDataTable,
  type DataTableColumnDef,
} from "@querycn/table-react";
import { useBrowserUrlAdapter } from "@querycn/filter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableEmpty } from "@/components/data-table/data-table-empty";
import { DataTableSearch } from "@/components/data-table/data-table-search";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import {
  EChartsComposedChart,
  Line,
  Dot,
  ActiveDot,
  XAxis,
  YAxis,
  Grid,
  Tooltip,
} from "@/components/evilcharts/charts/echarts-composed-chart";
import {
  getColorsCount,
  normalizeColor,
  withAlpha,
  type ChartConfig,
} from "@/components/evilcharts/ui/echarts-chart";
import {
  tooltipBaseOption,
  tooltipIndicatorHtml,
  tooltipRow,
  tooltipShell,
} from "@/components/evilcharts/ui/echarts-tooltip";
import BorderGlow from "@/components/BorderGlow";
import type { RouterBreakdown, RouterDaily } from "@/lib/types";
import { fmt2, fullNum } from "@/lib/utils";

export type RouterTrendProps = {
  /** null = DB 9router gagal -> komponen disembunyikan (fail-open). */
  daily: RouterDaily[] | null;
};

function shortDate(d: string): string {
  // "2026-10-02" -> "02/10". Label sumbu-X; nilai penuh ada di tooltip.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[2]}/${m[3]}` : d;
}

const routerColumnHelper = createDataTableColumnHelper<RouterBreakdown>();

const EMPTY_BREAKDOWN_ROWS: RouterBreakdown[] = [];

const NOOP_SUBSCRIBE = () => () => {};

/**
 * Tren harian + tabel breakdown (per provider, per model).
 *
 * Token/request angka penuh (`fullNum`); biaya & persen 2 desimal (`fmt2`).
 */
export function RouterTrend({ daily }: RouterTrendProps) {
  const { resolvedTheme } = useTheme();
  // Lihat router-cards.tsx: useSyncExternalStore, bukan useState+useEffect.
  const mounted = useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";
  const cardCls = isDark
    ? "border-0 bg-transparent backdrop-blur transition-colors rounded-2xl overflow-hidden"
    : "border border-primary/20 bg-transparent shadow-none backdrop-blur transition-colors hover:border-primary";
  const wrap = (node: React.ReactNode) =>
    isDark ? (
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
    ) : (
      node
    );

  // `ChartConfig` evilcharts tidak punya field `color`, hanya `colors: {light, dark}`.
  // Pakai `color:` di sini diam-diam bikin semua seri jatuh ke fallback abu-abu.
  // Palet diambil dari BorderGlow card di atas. `light` = sky-600 / violet-600:
  // >=4.5:1 di background terang tanpa jadi segel hitam setebal 2px.
  const config = React.useMemo<ChartConfig>(
    () => ({
      cost: { label: "biaya", colors: { light: ["#0284c7"], dark: ["#38bdf8"] } },
      requests: { label: "request", colors: { light: ["#7c3aed"], dark: ["#c084fc"] } },
    }),
    [],
  );

  const data = React.useMemo(() => daily ?? [], [daily]);

  // Sumbu dual (request kiri, biaya kanan) + tooltip full-precision harus ditulis
  // penuh: `chartOptions` di-merge SHALLOW, jadi `yAxis`/`tooltip` yang kita kirim
  // menggantikan seluruh hasil build komponen, bukan menempel padanya.
  const chartOptions = React.useMemo(() => {
    const fallback = isDark
      ? {
          border: "#2a2438",
          foreground: "#ede9f5",
          background: "#120f17",
          mutedForeground: "#a79fc0",
        }
      : {
          border: "#d1fae5",
          foreground: "#064e3b",
          background: "#f6fef9",
          mutedForeground: "#4d7c6f",
        };
    const read = (v: string, fb: string) => {
      if (!mounted) return fb;
      const raw = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      return raw ? normalizeColor(raw) : fb;
    };
    const tokens = {
      border: read("--border", fallback.border),
      foreground: read("--foreground", fallback.foreground),
      background: read("--background", fallback.background),
      mutedForeground: read("--muted-foreground", fallback.mutedForeground),
    };

    const axisCommon = {
      type: "value" as const,
      axisLine: { show: false },
      axisTick: {
        show: true,
        length: 0.5,
        lineStyle: { color: withAlpha(tokens.border, 1), width: 3, cap: "round" as const },
      },
      splitLine: {
        show: false,
      },
      axisLabel: {
        color: tokens.mutedForeground,
        fontSize: 10,
        margin: 8,
      },
    };

    return {
      yAxis: [
        {
          ...axisCommon,
          min: 0,
          splitLine: {
            show: true,
            lineStyle: { color: withAlpha(tokens.border, 1), type: [3, 3] as [number, number], width: 1 },
          },
          axisLabel: {
            ...axisCommon.axisLabel,
            formatter: (v: number) => fullNum(v),
          },
        },
        {
          ...axisCommon,
          position: "right" as const,
          axisLabel: {
            ...axisCommon.axisLabel,
            formatter: (v: number) => `$${fmt2(v)}`,
          },
        },
      ],
      // Tooltip default komponen pakai `toLocaleString()` -> presisi tak
      // konsisten. Override penuh: biaya 2 desimal, request angka penuh.
      tooltip: {
        ...tooltipBaseOption({
          present: true,
          cursor: true,
          tokens,
          position: "variable",
          axisPointerColor: withAlpha(tokens.border, 1),
          strokeWidth: 1,
        }),
        formatter: (params: unknown) => {
          const rows = (Array.isArray(params) ? params : [params]) as {
            seriesId?: string;
            seriesName?: string;
            value?: number | string;
            axisValue?: string | number;
            name?: string;
          }[];
          if (rows.length === 0) return "";
          const body = rows
            .map((p) => {
              if (String(p.seriesId ?? "").startsWith("__")) return "";
              const key = p.seriesId ?? p.seriesName ?? "";
              const item = config[key];
              const labelText =
                typeof item?.label === "string" ? item.label : (p.seriesName ?? key);
              const raw = Number(p.value);
              return tooltipRow({
                indicatorHtml: tooltipIndicatorHtml(key, item ? getColorsCount(item) : 1),
                labelText,
                valueText: key === "cost" ? `$${fmt2(raw)}` : fullNum(raw),
                dimmed: "",
              });
            })
            .join("");
          return tooltipShell({
            label: String(rows[0].axisValue ?? rows[0].name ?? ""),
            body,
            roundness: "lg",
            variant: "default",
          });
        },
      },
    };
  }, [mounted, isDark, config]);

  if (!daily || daily.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {wrap(
        <Card className={cardCls}>
          <CardHeader>
            <CardTitle className="text-sm">Tren harian: biaya vs request</CardTitle>
          </CardHeader>
          <CardContent>
            <EChartsComposedChart
              data={data}
              config={config}
              xDataKey="date"
              className="h-[260px] w-full sm:h-[320px]"
              chartOptions={chartOptions}
            >
              <Grid />
              <XAxis dataKey="date" tickFormatter={(v: string) => shortDate(v)} />
              <YAxis hideDots />
              <Tooltip variant="default" roundness="lg" cursor />
              <Line
                dataKey="requests"
                curveType="monotone"
                glow
                lineProps={{ yAxisIndex: 0 }}
              >
                <Dot variant="colored-border" />
                <ActiveDot variant="ping" />
              </Line>
              <Line
                dataKey="cost"
                curveType="monotone"
                strokeVariant="animated-dashed"
                lineProps={{ yAxisIndex: 1 }}
              >
                <Dot variant="colored-border" />
                <ActiveDot variant="ping" />
              </Line>
            </EChartsComposedChart>
          </CardContent>
        </Card>,
      )}
    </div>
  );
}

export type RouterBreakdownTableProps = {
  title: string;
  subtitle?: string;
  rows: RouterBreakdown[] | null;
  defaultSort?: { id: keyof RouterBreakdown; desc: boolean };
  /**
   * Namespace unik per tabel (2 tabel tampil di 1 halaman /router):
   * dipakai untuk URL params (?<id>-sort dsb.) + storage layout.
   */
  tableId: string;
};

/**
 * Tabel breakdown. Default sort provider = cost, model = request (sudah
 * ditentukan server di `getRouterStats`), tapi header bisa diklik untuk
 * mengurutkan ulang - jadi user bisa cari "provider dengan request terbanyak
 * tapi gratis" tanpa menunggu kami menebak.
 */
export function RouterBreakdownTable({
  title,
  subtitle,
  rows,
  defaultSort = { id: "cost", desc: true },
  tableId,
}: RouterBreakdownTableProps) {
  const adapter = useBrowserUrlAdapter();

  const columns = React.useMemo<DataTableColumnDef<RouterBreakdown>[]>(
    () => [
      routerColumnHelper.accessor("key", {
        header: "Kunci",
        meta: { label: "Kunci" },
        sortFn: "alphanumeric",
        cell: ({ row }) => (
          <span
            className="block max-w-[300px] truncate font-mono text-xs"
            title={row.original.key}
          >
            {row.original.key}
          </span>
        ),
      }),
      routerColumnHelper.accessor("requests", {
        header: "Request",
        meta: { label: "Request" },
        sortFn: "basic",
        cell: ({ row }) => (
          <span className="tabular-nums">{fullNum(row.original.requests)}</span>
        ),
      }),
      routerColumnHelper.accessor("cost", {
        header: "Biaya",
        meta: { label: "Biaya" },
        sortFn: "basic",
        cell: ({ row }) => (
          <span className="tabular-nums" title={`$${row.original.cost}`}>
            ${fmt2(row.original.cost)}
          </span>
        ),
      }),
      routerColumnHelper.accessor("costPer1k", {
        header: "$ / 1K req",
        meta: { label: "$ / 1K req" },
        sortFn: "basic",
        cell: ({ row }) => (
          <span className="tabular-nums" title={`$${row.original.costPer1k}`}>
            ${fmt2(row.original.costPer1k)}
          </span>
        ),
      }),
      routerColumnHelper.accessor("promptTokens", {
        header: "Prompt",
        meta: { label: "Prompt" },
        sortFn: "basic",
        cell: ({ row }) => (
          <span className="tabular-nums">{fullNum(row.original.promptTokens)}</span>
        ),
      }),
      routerColumnHelper.accessor("completionTokens", {
        header: "Completion",
        meta: { label: "Completion" },
        sortFn: "basic",
        cell: ({ row }) => (
          <span className="tabular-nums">{fullNum(row.original.completionTokens)}</span>
        ),
      }),
      routerColumnHelper.accessor("cacheHit", {
        header: "Cache hit",
        meta: { label: "Cache hit" },
        sortFn: "basic",
        cell: ({ row }) => {
          const v = row.original.cacheHit;
          return (
            <span className="tabular-nums" title={`${v}%`}>
              {v === 0 ? "0,00%" : `${fmt2(v)}%`}
            </span>
          );
        },
      }),
    ],
    [],
  );

  const data = rows ?? EMPTY_BREAKDOWN_ROWS;

  const tableUrl = React.useMemo(
    () => ({
      params: {
        sort: `${tableId}-sort`,
        page: `${tableId}-page`,
        perPage: `${tableId}-per-page`,
        search: `${tableId}-q`,
      },
      defaultSorting: [defaultSort],
      defaultPageSize: 100,
      pageSizes: [20, 50, 100],
    }),
    [defaultSort, tableId],
  );

  const table = useDataTable({
    data,
    columns,
    getRowId: (row) => row.key,
    mode: "client",
    adapter,
    searchColumns: ["key"],
    storageKey: `dashboard-router-${tableId}`,
    url: tableUrl,
  });

  if (rows == null) return null;

  return (
    <Card className="border border-primary/20 bg-transparent shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DataTableToolbar table={table}>
          <DataTableSearch table={table} placeholder="Cari kunci…" />
        </DataTableToolbar>
        <DataTable
          table={table}
          emptyState={
            <DataTableEmpty title="Belum ada data" hint="Ubah kata kunci pencarian untuk melihat hasil lain." />
          }
        />
        <DataTablePagination table={table} />
      </CardContent>
    </Card>
  );
}

export default RouterTrend;