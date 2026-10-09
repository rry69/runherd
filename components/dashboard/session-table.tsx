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
import { downloadText, stamp, toCSV } from "@/lib/export";

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
    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums max-w-[76px] truncate md:px-2 md:text-xs md:max-w-[120px]";
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

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

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
        cell: ({ row }) => {
          const r = row.original;
          const tokens = tokenMap?.[r.id];
          const base =
            r.directory.split(/[/\\]/).filter(Boolean).pop() || r.directory;
          return (
            <span className="block min-w-0">
              <span
                className="block truncate text-[13px] font-medium md:text-sm md:font-normal"
                title={r.title || r.id}
              >
                {r.title || r.id.slice(0, 8)}
              </span>
              {/* Mobile: info kolom tersembunyi diringkas di baris kedua — tanpa scroll-X. */}
              <span
                className="mt-0.5 block truncate text-[11px] text-muted-foreground md:hidden"
                title={r.directory}
              >
                {r.agent || "unknown"} · {base} ·{" "}
                {tokens == null ? "—" : `${compactNumber(tokens)} tok`}
              </span>
            </span>
          );
        },
      }),
      columnHelper.accessor("agent", {
        header: "Agent",
        meta: { label: "Agent" },
        cell: ({ row }) => (
          <span className="block max-w-[96px] truncate text-sm sm:max-w-[160px]" title={row.original.agent}>
            {row.original.agent || "unknown"}
          </span>
        ),
      }),
      columnHelper.accessor("directory", {
        header: "Directory",
        meta: { label: "Directory" },
        cell: ({ row }) => (
          <span className="block max-w-[120px] truncate text-sm tabular-nums sm:max-w-[220px]" title={row.original.directory}>
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
              className="text-xs tabular-nums text-muted-foreground md:text-sm"
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
          <span className="text-xs text-muted-foreground md:text-sm" title="Biaya per sesi tidak tersedia">
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

  // Mobile (<md): sembunyikan 4 kolom sekunder agar tabel muat tanpa
  // scroll-X. Infonya tetap tampil di sub-baris sel Session + kolom Status.
  const isMobile = useIsMobile();
  React.useEffect(() => {
    for (const id of ["agent", "directory", "tokens", "cost"]) {
      const col = table.getColumn(id);
      if (!col) continue;
      if (col.getIsVisible() === isMobile) col.toggleVisibility(!isMobile);
    }
  }, [isMobile, table]);

  // Kolom mengisi penuh lebar wadah (tanpa space kosong di kanan):
  // kolom Session fleksibel mengikuti lebar wadah, sisanya fixed.
  // table-fixed + minWidth total membuat tabel selalu selebar wadah.
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = React.useState(0);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWrapWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    if (!wrapWidth) return;
    const inner = wrapWidth - 2; // border DataTable
    if (isMobile) {
      table.setColumnSizing({
        title: Math.max(140, inner - 130),
        agent: 100,
        directory: 200,
        tokens: 110,
        cost: 80,
        status: 130,
      });
    } else {
      table.setColumnSizing({
        agent: 100,
        directory: 200,
        title: Math.max(160, inner - 630),
        tokens: 110,
        cost: 80,
        status: 140,
      });
    }
  }, [isMobile, table, wrapWidth]);

  const exportCSV = React.useCallback(() => {
    const rows = table.getFilteredRowModel().rows.map((r) => r.original);
    const csv = toCSV(
      ["id", "title", "agent", "directory", "parent_id", "time_updated", "status", "tokens"],
      rows.map((r) => [
        r.id,
        r.title,
        r.agent,
        r.directory,
        r.parent_id ?? "",
        r.time_updated,
        resolveStatus(r, statusMap),
        tokenMap?.[r.id] ?? "",
      ]),
    );
    downloadText(`sessions-${stamp()}.csv`, csv, "text/csv;charset=utf-8");
  }, [table, statusMap, tokenMap]);

  const exportJSON = React.useCallback(() => {
    const rows = table.getFilteredRowModel().rows.map((r) => r.original);
    downloadText(`sessions-${stamp()}.json`, JSON.stringify({ count: rows.length, rows }, null, 2), "application/json");
  }, [table]);

  return (
    <div ref={wrapRef} className="flex min-w-0 max-w-full flex-col gap-3 [&_table]:text-[13px] md:[&_table]:text-sm [&_td]:px-2.5 [&_td]:py-2 md:[&_td]:px-4 md:[&_td]:py-3 [&_th]:px-2.5 md:[&_th]:px-4">
      <DataTableToolbar table={table}>
        <DataTableSearch table={table} placeholder={placeholder} />
        <FilterBuilder />
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={exportCSV} title="Export baris terfilter ke CSV" className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            CSV
          </button>
          <button type="button" onClick={exportJSON} title="Export baris terfilter ke JSON" className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            JSON
          </button>
        </span>
      </DataTableToolbar>
      <FilterChips />
      <DataTable
        table={table}
        className="max-w-full rounded-md border-border bg-transparent"
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
