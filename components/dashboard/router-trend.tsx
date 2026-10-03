"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="h-3 w-3" aria-hidden />;
  if (sorted === "desc") return <ArrowDown className="h-3 w-3" aria-hidden />;
  return <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />;
}

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

  const billable = React.useMemo(
    () => (daily ?? []).filter((d) => d.cost > 0).length,
    [daily],
  );

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
            <p className="text-xs text-muted-foreground">
              {billable} dari {daily.length} hari punya biaya. Garis ungu = request
              (sumbu kiri); garis biru putus-putus = biaya harian (sumbu kanan).
            </p>
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
}: RouterBreakdownTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([defaultSort]);

  const columns = React.useMemo<ColumnDef<RouterBreakdown>[]>(
    () => [
      {
        accessorKey: "key",
        header: () => <span className="font-semibold">Kunci</span>,
        cell: ({ row }) => (
          <span
            className="block max-w-[300px] truncate font-mono text-xs"
            title={row.original.key}
          >
            {row.original.key}
          </span>
        ),
        sortingFn: "alphanumeric",
      },
      {
        accessorKey: "requests",
        header: ({ column }) => (
          <HeadButton column={column} label="Request" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{fullNum(row.original.requests)}</span>
        ),
      },
      {
        accessorKey: "cost",
        header: ({ column }) => <HeadButton column={column} label="Biaya" />,
        cell: ({ row }) => (
          <span className="tabular-nums" title={`$${row.original.cost}`}>
            ${fmt2(row.original.cost)}
          </span>
        ),
      },
      {
        accessorKey: "costPer1k",
        header: ({ column }) => (
          <HeadButton column={column} label="$ / 1K req" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums" title={`$${row.original.costPer1k}`}>
            ${fmt2(row.original.costPer1k)}
          </span>
        ),
      },
      {
        accessorKey: "promptTokens",
        header: ({ column }) => <HeadButton column={column} label="Prompt" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{fullNum(row.original.promptTokens)}</span>
        ),
      },
      {
        accessorKey: "completionTokens",
        header: ({ column }) => <HeadButton column={column} label="Completion" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{fullNum(row.original.completionTokens)}</span>
        ),
      },
      {
        accessorKey: "cacheHit",
        header: ({ column }) => <HeadButton column={column} label="Cache hit" />,
        cell: ({ row }) => {
          const v = row.original.cacheHit;
          return (
            <span className="tabular-nums" title={`${v}%`}>
              {v === 0 ? "0,00%" : `${fmt2(v)}%`}
            </span>
          );
        },
      },
    ],
    [],
  );

  const data = rows ?? [];

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows == null) return null;

  return (
    <Card className="border border-primary/20 bg-transparent shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-2xl border border-primary/20">
          <Table className="w-full caption-bottom text-sm">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-b border-primary/20">
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="px-3 py-6 text-center opacity-60">
                    Belum ada data.
                  </TableCell>
                </TableRow>
              )}
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-primary/20 transition-colors last:border-0 hover:bg-primary/5"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-3 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {table.getRowModel().rows.length} baris (top 10 dari total pada periode).
        </p>
      </CardContent>
    </Card>
  );
}

function HeadButton({
  column,
  label,
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label} <SortIcon sorted={column.getIsSorted()} />
    </Button>
  );
}

export default RouterTrend;