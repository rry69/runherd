"use client";

// Orkestrasi kanban sessions-06: fetch /api/sessions + /api/overrides saat
// mount, poll /api/sessions 1s fail-open (ok:false → pertahankan rows/active
// terakhir, jangan timpa). Rename via PUT aliases, hide/delete via hidden,
// Move via workflow. Tanpa data mock statis — semua dari fetch live.
//
// Dua bentuk export:
// - `SessionsKanban` (named, controlled): Toolbar + Board untuk /sessions.
//   Seleksi + sync dilaporkan ke parent via props.
// - default (standalone): komposisi penuh Board + Inspector.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActiveChild, SessionRow } from "@/lib/types";
import Toolbar from "./Toolbar";
import Board from "./Board";
import Inspector from "./Inspector";
import {
  colOf,
  deriveBreakdown,
  formatAge,
  formatTokens,
  liveStatus,
  matchesFilter,
  normTs,
  type KanbanCard,
  type KanbanColumn,
  type KanbanFilter,
  type KanbanItem,
} from "./types";

const POLL_MS = 1000;
const WORKFLOW_COLS: KanbanColumn[] = ["thinking", "progress", "review", "done"];
const EMPTY_FILTER: KanbanFilter = { q: "", chip: null, tab: "all", sel: null };

const agentKeyOf = (r: SessionRow) => r.agent || "unknown";
const agentIdOf = (r: SessionRow) => `agent:${agentKeyOf(r)}`;

const sameKeys = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && kb.every((k) => a[k] === b[k]);
};

function useSessionsKanbanData() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [activeMap, setActiveMap] = useState<Record<string, ActiveChild[]>>({});
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState<Record<string, KanbanColumn>>({});
  const [filter, setFilter] = useState<KanbanFilter>(EMPTY_FILTER);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Load overrides sekali saat mount: alias + hidden + workflow.
  useEffect(() => {
    let alive = true;
    fetch("/api/overrides", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        setAliases(json.aliases ?? {});
        setHidden(json.hidden ?? []);
        const wf: Record<string, KanbanColumn> = {};
        if (json.workflow && typeof json.workflow === "object") {
          for (const [k, v] of Object.entries(json.workflow as Record<string, unknown>)) {
            if (typeof v === "string" && (WORKFLOW_COLS as string[]).includes(v)) {
              wf[k] = v as KanbanColumn;
            }
          }
        }
        setWorkflow(wf);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback(
    async (
      nextAliases: Record<string, string>,
      nextHidden: string[],
      nextWorkflow: Record<string, KanbanColumn>,
    ) => {
      try {
        await fetch("/api/overrides", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aliases: nextAliases, hidden: nextHidden, workflow: nextWorkflow }),
        });
      } catch {
        // Poll berikutnya / load ulang menimpa; abaikan error PUT.
      }
    },
    [],
  );

  // Poll 1s fail-open: ok:false → set error, jangan timpa rows/active.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/sessions", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!json.ok) {
          setError(json.error ?? "API gagal");
          return;
        }
        setError(null);
        const next = json.data as SessionRow[];
        const nextNames = (json.names ?? {}) as Record<string, string>;
        setNames((prev) => (sameKeys(prev, nextNames) ? prev : nextNames));
        // Fail-open: field `active` hilang saat DB error → pertahankan
        // activeMap terakhir (tetap thinking), jangan timpa kosong.
        if (json.active != null) {
          const nextActive = json.active as Record<string, ActiveChild[]>;
          setActiveMap((prev) => (sameKeys(prev, nextActive) ? prev : nextActive));
        }
        setRows((prev) => {
          if (prev.length === 0) return next;
          if (
            prev.length === next.length &&
            prev.every((r, i) => r.id === next[i]?.id && r.time_updated === next[i]?.time_updated)
          )
            return prev;
          return next;
        });
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // now = state + interval agar useMemo tetap pure (tanpa Date.now di render).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), POLL_MS);
    return () => clearInterval(t);
  }, []);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  // Derivasi live: parent saja, hidden cascade (diri / agent), status dari
  // activeChildren + workflow, tokens/age/breakdown dari data poll.
  const items: KanbanItem[] = useMemo(() => {
    return rows
      .filter((r) => r.parent_id === null)
      .filter((r) => !hiddenSet.has(r.id) && !hiddenSet.has(agentIdOf(r)))
      .map((r) => {
        const children = activeMap[r.id] ?? [];
        const wf = workflow[r.id] ?? null;
        const status = liveStatus(children.length, wf);
        const tokens = children.reduce((a, c) => a + (c.tokens || 0), 0);
        const ts = normTs(r.time_updated);
        const ageMs = Math.max(0, now - ts);
        return {
          id: r.id,
          alias: aliases[r.id] ?? names[r.id] ?? r.agent,
          title: r.title,
          agent: agentKeyOf(r),
          dir: r.directory,
          tokens,
          tokensLabel: formatTokens(tokens),
          ageMs,
          ageLabel: formatAge(ageMs),
          timeUpdated: ts,
          status,
          col: colOf(status, wf),
          activeChildren: children,
          breakdown: deriveBreakdown(tokens, children.length),
        } satisfies KanbanItem;
      })
      .sort((a, b) => b.timeUpdated - a.timeUpdated);
  }, [rows, names, activeMap, aliases, hiddenSet, workflow, now]);

  const agents = useMemo(() => [...new Set(items.map((i) => i.agent))].sort(), [items]);

  const showing = useMemo(() => items.filter((i) => matchesFilter(i, filter)).length, [items, filter]);

  const handleRename = useCallback(
    (id: string) => {
      const cur = aliases[id] ?? names[id] ?? id.slice(0, 8);
      const nn = window.prompt("Rename alias:", cur);
      if (nn === null) return;
      const trimmed = nn.trim();
      const next = { ...aliases };
      if (!trimmed) delete next[id];
      else next[id] = trimmed;
      setAliases(next);
      persist(next, hidden, workflow);
    },
    [aliases, names, hidden, workflow, persist],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (hiddenSet.has(id)) return;
      const next = [...hidden, id];
      setHidden(next);
      persist(aliases, next, workflow);
      setFilter((f) => (f.sel === id ? { ...f, sel: null } : f));
    },
    [hidden, hiddenSet, aliases, workflow, persist],
  );

  const handleMove = useCallback(
    (id: string, col: KanbanColumn) => {
      const next = { ...workflow, [id]: col };
      setWorkflow(next);
      persist(aliases, hidden, next);
      setFilter((f) => ({ ...f, sel: id }));
    },
    [workflow, aliases, hidden, persist],
  );

  return {
    items,
    agents,
    showing,
    filter,
    setFilter,
    error,
    handleRename,
    handleDelete,
    handleMove,
  };
}

type SessionsKanbanProps = {
  selectedId: string | null;
  onPick: (card: KanbanCard) => void;
  onSync: (card: KanbanCard | null) => void;
};

/** Board controlled untuk /sessions: Toolbar + Board, fetch live di dalam. */
export function SessionsKanban({ selectedId, onPick, onSync }: SessionsKanbanProps) {
  const data = useSessionsKanbanData();
  const { items } = data;

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    onSync(selected);
  }, [selected, onSync]);

  const viewFilter = useMemo(
    () => ({ ...data.filter, sel: selectedId }),
    [data.filter, selectedId],
  );

  return (
    <div className="min-w-0 flex-1 space-y-4 p-3 sm:p-5 lg:p-6">
      {data.error && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
        >
          API error: {data.error} — menampilkan data terakhir (fail-open).
        </div>
      )}
      {!data.error && items.length === 0 && (
        <div className="rounded-md border p-3 text-sm opacity-60" style={{ borderColor: "var(--border)" }}>
          Memuat sesi…
        </div>
      )}
      <Toolbar
        filter={viewFilter}
        agents={data.agents}
        showing={data.showing}
        total={items.length}
        onQuery={(q) => data.setFilter((f) => ({ ...f, q }))}
        onChip={(chip) => data.setFilter((f) => ({ ...f, chip: f.chip === chip ? null : chip }))}
        onTab={(tab) => data.setFilter((f) => ({ ...f, tab }))}
        onClear={() => data.setFilter((f) => ({ ...f, q: "", chip: null, tab: "all" }))}
      />
      <Board
        items={items}
        filter={viewFilter}
        onSelect={(id) => {
          const card = items.find((i) => i.id === id);
          if (card) onPick(card);
        }}
        onMove={data.handleMove}
        onRename={data.handleRename}
        onDelete={data.handleDelete}
      />
      <footer className="pb-16 text-center text-[11px] lg:pb-4" style={{ color: "var(--muted-foreground)" }}>
        sessions-06-kanban-inspector · klik kartu → detail modal · Move To pengganti drag (mobile)
      </footer>
    </div>
  );
}

/** Komposisi standalone: board full-width + Inspector modal overlay. */
export default function SessionsKanbanStandalone() {
  const data = useSessionsKanbanData();
  const { items } = data;
  const selected = useMemo(
    () => items.find((i) => i.id === data.filter.sel) ?? null,
    [items, data.filter.sel],
  );

  return (
    <div className="skan-root w-full">
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="min-w-0 flex-1 space-y-4 p-3 sm:p-5 lg:p-6">
          {data.error && (
            <div
              className="rounded-md border p-3 text-sm"
              style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
            >
              API error: {data.error} — menampilkan data terakhir (fail-open).
            </div>
          )}
          {!data.error && items.length === 0 && (
            <div className="rounded-md border p-3 text-sm opacity-60" style={{ borderColor: "var(--border)" }}>
              Memuat sesi…
            </div>
          )}
          <Toolbar
            filter={data.filter}
            agents={data.agents}
            showing={data.showing}
            total={items.length}
            onQuery={(q) => data.setFilter((f) => ({ ...f, q }))}
            onChip={(chip) => data.setFilter((f) => ({ ...f, chip: f.chip === chip ? null : chip }))}
            onTab={(tab) => data.setFilter((f) => ({ ...f, tab }))}
            onClear={() => data.setFilter((f) => ({ ...f, q: "", chip: null, tab: "all" }))}
          />
          <Board
            items={items}
            filter={data.filter}
            onSelect={(id) => data.setFilter((f) => ({ ...f, sel: id }))}
            onMove={data.handleMove}
            onRename={data.handleRename}
            onDelete={data.handleDelete}
          />
          <footer className="pb-16 text-center text-[11px] lg:pb-4" style={{ color: "var(--muted-foreground)" }}>
            sessions-06-kanban-inspector · klik kartu → detail modal · Move To pengganti drag (mobile)
          </footer>
        </div>
      </main>
      <Inspector item={selected} open={!!selected} onClose={() => data.setFilter((f) => ({ ...f, sel: null }))} />
    </div>
  );
}
