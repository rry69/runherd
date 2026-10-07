"use client";

import * as React from "react";
import {
  createDataTableColumnHelper,
  enTableMessages,
  useDataTable,
  type DataTableColumnDef,
} from "@querycn/table-react";
import { FilterProvider, useBrowserUrlAdapter } from "@querycn/filter-react";
import type { FieldDefinition } from "@querycn/filter-core";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableEmpty } from "@/components/data-table/data-table-empty";
import { DataTableSearch } from "@/components/data-table/data-table-search";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { FilterBuilder } from "@/components/filter/filter-builder";
import { FilterChips } from "@/components/filter/filter-chips";
import type { SessionRow } from "@/lib/types";

export type SessionTableProps = {
  /** Rows penuh dari GET /api/sessions (tanpa fetch di dalam komponen). */
  data: SessionRow[];
  /**
   * Peta opsional id -> label status (mis. dari `activeMap`: thinking/idle).
   * Label yang didukung: `thinking`, `failed` (label kanban /sessions) atau
   * `stuck` (label lama) untuk thinking yang melewati ambang, `progress`,
   * `queued`, `review`, dan `idle` — `queued`/`progress`/`review` muncul
   * hanya bila `statusMap` menghormati workflow override (label kanban).
   * SessionRow tidak punya field `status`, jadi bila tidak diisi,
   * kolom status fallback ke derivasi struktural
   * `parent_id === null ? "main" : "child"`.
   */
  statusMap?: Record<string, string>;
  tokenMap?: Record<string, number>;
  placeholder?: string;
};

function resolveStatus(row: SessionRow, statusMap?: Record<string, string>): string {
  const s = statusMap?.[row.id]?.trim().toLowerCase();
  if (s) return s;
  // SessionRow asli tidak punya status → derivasi struktural.
  return row.parent_id === null ? "main" : "child";
}

/**
 * Mapping status -> Badge variant. Caller boleh mengirim "failed" (label kanban
 * /sessions) atau "stuck" via statusMap untuk thinking melewati ambang.
 */
function statusBadgeClass(v: string): string {
  const base =
    "rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums max-w-[120px] truncate";
  if (v === "queued") return `${base} border-slate-500/30 bg-slate-500/10 text-slate-300`;
  if (v === "failed" || v === "stuck")
    return `${base} border-red-400/30 bg-red-400/10 text-red-300`;
  if (v === "progress") return `${base} border-sky-400/30 bg-sky-400/10 text-sky-300`;
  if (v === "review") return `${base} border-amber-400/30 bg-amber-400/10 text-amber-300`;
  if (v === "thinking") return `${base} border-violet-400/30 bg-violet-400/10 text-violet-300`;
  return `${base} border-border bg-muted text-muted-foreground`;
}

function compactNumber(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString("id-ID");
}

const columnHelper = createDataTableColumnHelper<SessionRow>();
const tableMessages = {
  ...enTableMessages,
  counts: {
    ...enTableMessages.counts,
    rows: (count: number) => `Showing ${count} sessions`,
  },
};

function SessionTableInner({
  data,
  statusMap,
  tokenMap,
  placeholder,
}: Required<Pick<SessionTableProps, "data" | "placeholder">> &
  Pick<SessionTableProps, "statusMap" | "tokenMap">) {
  const columns = React.useMemo<DataTableColumnDef<SessionRow>[]>(() => {
    return [
      columnHelper.accessor("title", {
        header: "Session",
        meta: { label: "Session" },
        cell: ({ row }) => (
          <span
            className="block max-w-[260px] truncate text-sm"
            title={row.original.title || row.original.id}
          >
            {row.original.title || row.original.id.slice(0, 8)}
          </span>
        ),
      }),
      columnHelper.accessor("agent", {
        header: "Agent",
        meta: { label: "Agent" },
        cell: ({ row }) => (
          <span className="block max-w-[160px] truncate text-sm" title={row.original.agent}>
            {row.original.agent || "unknown"}
          </span>
        ),
      }),
      columnHelper.accessor("directory", {
        header: "Directory",
        meta: { label: "Directory" },
        cell: ({ row }) => (
          <span className="block max-w-[220px] truncate text-sm tabular-nums" title={row.original.directory}>
            {row.original.directory}
          </span>
        ),
      }),
      columnHelper.accessor((row) => tokenMap?.[row.id], {
        id: "tokens",
        header: "Tokens",
        meta: { label: "Tokens" },
        sortFn: "basic",
        cell: ({ row }) => {
          const value = tokenMap?.[row.original.id];
          return (
            <span
              className="tabular-nums text-muted-foreground"
              title={value?.toLocaleString("id-ID")}
            >
              {value == null ? "—" : compactNumber(value)}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "cost",
        header: "Biaya",
        meta: { label: "Biaya" },
        cell: () => (
          <span className="text-muted-foreground" title="Biaya per sesi tidak tersedia">
            $0
          </span>
        ),
      }),
      columnHelper.accessor((row) => resolveStatus(row, statusMap), {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        // Dulu header Status polos tanpa tombol sort — pertahankan.
        enableSorting: false,
        cell: ({ row }) => {
          const v = resolveStatus(row.original, statusMap);
          return (
            <Badge variant="outline" className={statusBadgeClass(v)}>
              <span aria-hidden="true" className="mr-1">●</span>
              {v}
            </Badge>
          );
        },
      }),
    ];
  }, [statusMap, tokenMap]);

  const table = useDataTable({
    data,
    columns,
    getRowId: (row) => row.id,
    mode: "client",
    searchColumns: ["id", "agent", "directory", "title"],
    getFilterValue: (row, field) =>
      field.name === "status"
        ? resolveStatus(row, statusMap)
        : row[field.name as keyof SessionRow],
    storageKey: "dashboard-session-table",
    url: {
      params: {
        sort: "sessions-sort",
        page: "sessions-page",
        perPage: "sessions-per-page",
        search: "sessions-q",
      },
      defaultSorting: [{ id: "title", desc: false }],
      defaultPageSize: 10,
      pageSizes: [10, 20, 30, 50],
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar table={table}>
        <DataTableSearch table={table} placeholder={placeholder} />
        <FilterBuilder />
      </DataTableToolbar>
      <FilterChips />
      <DataTable
        table={table}
        className="rounded-md border-border bg-transparent"
        messages={tableMessages}
        emptyState={
          <DataTableEmpty title="Belum ada data" hint="Ubah kata kunci atau filter untuk melihat hasil lain." />
        }
      />
      <DataTablePagination table={table} messages={tableMessages} className="px-1" />
    </div>
  );
}

export function SessionTable({
  data,
  statusMap,
  tokenMap,
  placeholder = "Filter agent / title / directory / id…",
}: SessionTableProps) {
  const adapter = useBrowserUrlAdapter();

  const statusOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of data) s.add(resolveStatus(r, statusMap));
    return [...s].sort();
  }, [data, statusMap]);

  const fields = React.useMemo<FieldDefinition[]>(
    () => [
      {
        name: "status",
        label: "Status",
        type: "select",
        options: statusOptions.map((o) => ({ label: o, value: o })),
      },
      { name: "agent", label: "Agent", type: "text" },
      { name: "title", label: "Title", type: "text" },
      { name: "directory", label: "Directory", type: "text" },
    ],
    [statusOptions],
  );

  return (
    <FilterProvider fields={fields} adapter={adapter}>
      <SessionTableInner
        data={data}
        statusMap={statusMap}
        tokenMap={tokenMap}
        placeholder={placeholder}
      />
    </FilterProvider>
  );
}

export default SessionTable;
