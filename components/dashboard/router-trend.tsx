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
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import BorderGlow from "@/components/BorderGlow";
import type { RouterBreakdown, RouterDaily } from "@/lib/types";
import { fullNum, splitNum } from "@/lib/utils";

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
 * Angka PENUH di mana-mana: sumbu-Y, tooltip, dan sel tabel semuanya memakai
 * `fullNum`. Cost tidak pernah `toFixed(2)` — `4,605448` adalah informasi,
 * `4,61` adalah kebohongan.
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

  const config = React.useMemo<ChartConfig>(
    () => ({
      cost: { label: "biaya", color: "#059669" },
      requests: { label: "request", color: "#f472b6" },
    }),
    [],
  );

  const data = React.useMemo(
    () => (daily ?? []).map((d) => ({ ...d, label: shortDate(d.date) })),
    [daily],
  );

  const billable = React.useMemo(
    () => (daily ?? []).filter((d) => d.cost > 0).length,
    [daily],
  );

  if (!daily || daily.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {wrap(
        <Card className={cardCls}>
          <CardHeader>
            <CardTitle className="text-sm">Tren harian: biaya vs request</CardTitle>
            <p className="text-xs text-muted-foreground">
              {billable} dari {daily.length} hari punya biaya. Bar abu-abu tinggi = busy tapi
              gratis (cache / free tier); titik hijau = hari yang benar-benar billed.
            </p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={config} className="h-[260px] w-full sm:h-[320px]">
              <ComposedChart data={data} margin={{ left: -8, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval="preserveStartEnd"
                  angle={-16}
                  dy={8}
                  height={44}
                />
                <YAxis
                  yAxisId="req"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  width={56}
                  tickFormatter={(v: number) => fullNum(v)}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  width={64}
                  tickFormatter={(v: number) => `$${fullNum(v)}`}
                />
                <ChartTooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_v, payload) => {
                        const p = payload?.[0]?.payload as { date?: string } | undefined;
                        return p?.date ?? "";
                      }}
                      formatter={(value, name) => {
                        const raw = Number(value);
                        const isCost = name === "cost";
                        return (
                          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">
                              {isCost ? "biaya" : "request"}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {isCost ? `$${fullNum(raw)}` : fullNum(raw)}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar
                  yAxisId="req"
                  dataKey="requests"
                  name="requests"
                  fill="var(--color-requests)"
                  fillOpacity={0.35}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="cost"
                  name="cost"
                  stroke="var(--color-cost)"
                  strokeWidth={2}
                  dot={{ r: 2, strokeWidth: 0, fill: "var(--color-cost)" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <ReferenceLine yAxisId="cost" y={0} stroke="var(--border)" />
              </ComposedChart>
            </ChartContainer>
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
        cell: ({ row }) => {
          const { head, tail } = splitNum(fullNum(row.original.cost));
          return (
            <span
              className="tabular-nums"
              title={`$${row.original.cost}`}
            >
              ${head}
              {tail && <span className="text-[10px] text-muted-foreground">{tail}</span>}
            </span>
          );
        },
      },
      {
        accessorKey: "costPer1k",
        header: ({ column }) => (
          <HeadButton column={column} label="$ / 1K req" />
        ),
        cell: ({ row }) => {
          const { head, tail } = splitNum(fullNum(row.original.costPer1k));
          return (
            <span className="tabular-nums" title={`$${row.original.costPer1k}`}>
              ${head}
              {tail && <span className="text-[10px] text-muted-foreground">{tail}</span>}
            </span>
          );
        },
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
              {v === 0 ? "0" : `${v.toFixed(4)}%`}
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