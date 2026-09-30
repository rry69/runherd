"use client";

import * as React from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SessionRow } from "@/lib/types";

export type SessionTableProps = {
  /** Rows penuh dari GET /api/sessions (tanpa fetch di dalam komponen). */
  data: SessionRow[];
  /**
   * Peta opsional id -> label status (mis. dari `activeMap`: thinking/idle).
   * SessionRow tidak punya field `status`, jadi bila tidak diisi,
   * kolom status fallback ke derivasi `parent_id === null ? "main" : "child"`.
   */
  statusMap?: Record<string, string>;
  placeholder?: string;
};

function resolveStatus(row: SessionRow, statusMap?: Record<string, string>): string {
  const s = statusMap?.[row.id]?.trim().toLowerCase();
  if (s) return s;
  // SessionRow asli tidak punya status → derivasi struktural.
  return row.parent_id === null ? "main" : "child";
}

/**
 * Mapping status -> Badge variant (reuse token existing, tanpa palet baru):
 * thinking -> default (primary), stuck -> destructive,
 * idle/main -> secondary, child -> outline.
 * Caller boleh mengirim "stuck" via statusMap untuk thinking >5min.
 * Styling visual mockup-02 (mint): running/done/thinking -> emerald,
 * queued -> lime, failed/stuck -> red. Hanya className, logika variant tetap.
 */
function statusVariant(v: string): "default" | "destructive" | "secondary" | "outline" {
  if (v === "stuck") return "destructive";
  if (v === "thinking") return "default";
  if (v === "child") return "outline";
  return "secondary";
}

function statusBadgeClass(v: string): string {
  const base =
    "rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums max-w-[120px] truncate";
  if (v === "queued") return `${base} border-lime-500 bg-lime-50 text-lime-800`;
  if (v === "failed" || v === "stuck")
    return `${base} border-red-300 bg-white text-red-600`;
  // running / done / thinking / idle / main / child fallback → emerald mint.
  return `${base} border-emerald-500 bg-white text-emerald-700`;
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="h-3 w-3" aria-hidden />;
  if (sorted === "desc") return <ArrowDown className="h-3 w-3" aria-hidden />;
  return <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />;
}

function formatTime(epochSec: number): string {
  try {
    const ms = epochSec < 1e12 ? epochSec * 1000 : epochSec;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return String(epochSec);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(epochSec);
  }
}

export function SessionTable({ data, statusMap, placeholder = "Filter agent / title / directory / id…" }: SessionTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "time_updated", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 50 });

  const columns = React.useMemo<ColumnDef<SessionRow>[]>(() => {
    return [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="block max-w-[96px] truncate font-mono text-xs tabular-nums" title={row.original.id}>
            {row.original.id.slice(0, 8)}
          </span>
        ),
      },
      {
        accessorKey: "agent",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-7 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Agent <SortIcon sorted={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="block max-w-[160px] truncate text-sm" title={row.original.agent}>
            {row.original.agent || "unknown"}
          </span>
        ),
        filterFn: "includesString",
      },
      {
        accessorKey: "directory",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-7 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Directory <SortIcon sorted={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="block max-w-[220px] truncate text-sm tabular-nums" title={row.original.directory}>
            {row.original.directory}
          </span>
        ),
        filterFn: "includesString",
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <span className="block max-w-[260px] truncate text-sm" title={row.original.title}>
            {row.original.title || "—"}
          </span>
        ),
        filterFn: "includesString",
      },
      {
        accessorKey: "time_updated",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-7 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Updated <SortIcon sorted={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums" title={String(row.original.time_updated)}>
            {formatTime(row.original.time_updated)}
          </span>
        ),
        sortingFn: "basic",
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => resolveStatus(row, statusMap),
        cell: ({ getValue }) => {
          const v = String(getValue() ?? "-");
          return (
            <Badge variant={statusVariant(v)} className={statusBadgeClass(v)}>
              ● {v}
            </Badge>
          );
        },
        filterFn: (row, _colId, filterValue: string) => {
          if (!filterValue || filterValue === "all") return true;
          return resolveStatus(row.original, statusMap) === filterValue;
        },
      },
    ];
  }, [statusMap]);

  const filteredByStatus = React.useMemo(() => {
    if (statusFilter === "all") return data;
    return data.filter((r) => resolveStatus(r, statusMap) === statusFilter);
  }, [data, statusFilter, statusMap]);

  const statusOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of data) s.add(resolveStatus(r, statusMap));
    return ["all", ...[...s].sort()];
  }, [data, statusMap]);

  const table = useReactTable({
    data: filteredByStatus,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _colId, filterValue: string) => {
      const q = String(filterValue ?? "").toLowerCase();
      if (!q) return true;
      const r = row.original;
      return (
        r.id.toLowerCase().includes(q) ||
        (r.agent || "").toLowerCase().includes(q) ||
        (r.directory || "").toLowerCase().includes(q) ||
        (r.title || "").toLowerCase().includes(q)
      );
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-44 max-w-sm rounded-full border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
        {/* Filter status via DropdownMenu primitives. */}
        <div className="flex items-center gap-2 text-sm">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full border bg-white px-3 text-sm font-semibold text-emerald-800"
              >
                Status: {statusFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Filter status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                {statusOptions.map((o) => (
                  <DropdownMenuRadioItem key={o} value={o}>
                    {o}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {(globalFilter || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setGlobalFilter("");
                setStatusFilter("all");
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <div
        className="overflow-x-auto rounded-2xl border bg-white shadow-sm"
        style={{ borderColor: "#d1fae5" }}
      >
        <Table className="w-full caption-bottom text-sm">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-b" style={{ borderColor: "#d1fae5" }}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-emerald-800"
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
                className="border-b transition-colors last:border-0 hover:bg-[#ecfdf5]"
                style={{ borderColor: "#d1fae5" }}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs tabular-nums text-slate-500">
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())} ·{" "}
          {table.getRowModel().rows.length} dari {table.getFilteredRowModel().rows.length} sesi
          (total {data.length})
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full border bg-white px-3 text-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            ‹ Prev
          </Button>
          {Array.from({ length: Math.min(2, Math.max(1, table.getPageCount())) }).map((_, i) => {
            const active = table.getState().pagination.pageIndex === i;
            return (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className={
                  active
                    ? "h-8 rounded-full px-3 text-sm font-semibold text-white"
                    : "h-8 rounded-full border bg-white px-3 text-sm"
                }
                style={active ? { background: "#059669", borderColor: "#059669" } : { borderColor: "#d1fae5" }}
                onClick={() => table.setPageIndex(i)}
              >
                {i + 1}
              </Button>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full border bg-white px-3 text-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next ›
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SessionTable;
