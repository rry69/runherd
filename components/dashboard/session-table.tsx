"use client";

import * as React from "react";
import {
  createDataTableColumnHelper,
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
 * thinking/progress -> default (primary), failed/stuck -> destructive,
 * queued/review/idle/main -> secondary, child -> outline.
 * Caller boleh mengirim "failed" (label kanban /sessions) atau "stuck" (label
 * lama) via statusMap untuk thinking melewati ambang.
 * Styling visual mockup-02 (mint): running/done/thinking -> emerald,
 * queued -> lime, failed/stuck -> red, progress -> sky, review -> amber.
 * Hanya className, logika variant tetap.
 */
function statusVariant(v: string): "default" | "destructive" | "secondary" | "outline" {
  // "failed" = label kanban (/sessions), "stuck" = label lama — keduanya
  // badge merah yang sama.
  if (v === "stuck" || v === "failed") return "destructive";
  // "progress" = aktif dikerjakan, sekelas "thinking" (actively working).
  if (v === "thinking" || v === "progress") return "default";
  if (v === "child") return "outline";
  // queued/review/idle/main sengaja sekelas: tak satu pun "danger", jadi
  // badge netral; pembeda warna datang dari statusBadgeClass.
  return "secondary";
}

function statusBadgeClass(v: string): string {
  const base =
    "rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums max-w-[120px] truncate";
  if (v === "queued") return `${base} border-lime-500 bg-primary/10 text-foreground`;
  if (v === "failed" || v === "stuck")
    return `${base} border-red-300 bg-card/70 text-red-600`;
  // progress = biru/sky: active work, dibedakan dari thinking (mint) & queued (lime).
  if (v === "progress") return `${base} border-sky-500 bg-card/70 text-sky-700`;
  // review = amber/kuning: butuh verifikasi, bukan error merah.
  if (v === "review") return `${base} border-amber-400 bg-card/70 text-amber-700`;
  // running / done / thinking / idle / main / child fallback → emerald mint.
  return `${base} border-emerald-500 bg-card/70 text-foreground`;
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

const columnHelper = createDataTableColumnHelper<SessionRow>();

function SessionTableInner({
  data,
  statusMap,
  placeholder,
}: Required<Pick<SessionTableProps, "data" | "placeholder">> &
  Pick<SessionTableProps, "statusMap">) {
  const columns = React.useMemo<DataTableColumnDef<SessionRow>[]>(() => {
    return [
      columnHelper.accessor("id", {
        header: "ID",
        meta: { label: "ID" },
        cell: ({ row }) => (
          <span className="block max-w-[96px] truncate font-mono text-xs tabular-nums" title={row.original.id}>
            {row.original.id.slice(0, 8)}
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
      columnHelper.accessor("title", {
        header: "Title",
        meta: { label: "Title" },
        cell: ({ row }) => (
          <span className="block max-w-[260px] truncate text-sm" title={row.original.title}>
            {row.original.title || "—"}
          </span>
        ),
      }),
      columnHelper.accessor("time_updated", {
        header: "Updated",
        meta: { label: "Updated" },
        sortFn: "basic",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums" title={String(row.original.time_updated)}>
            {formatTime(row.original.time_updated)}
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
            <Badge variant={statusVariant(v)} className={statusBadgeClass(v)}>
              ● {v}
            </Badge>
          );
        },
      }),
    ];
  }, [statusMap]);

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
      defaultSorting: [{ id: "time_updated", desc: true }],
      defaultPageSize: 50,
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
        emptyState={
          <DataTableEmpty title="Belum ada data" hint="Ubah kata kunci atau filter untuk melihat hasil lain." />
        }
      />
      <DataTablePagination table={table} />
    </div>
  );
}

export function SessionTable({ data, statusMap, placeholder = "Filter agent / title / directory / id…" }: SessionTableProps) {
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
      <SessionTableInner data={data} statusMap={statusMap} placeholder={placeholder} />
    </FilterProvider>
  );
}

export default SessionTable;
