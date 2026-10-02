"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActiveChild, LiveMap, SessionRow, SubagentTask, TokenSession } from "@/lib/types";
import { activeForMs as libActiveForMs } from "@/lib/live-status";
import { FullPageLoader } from "@/components/dashboard/fullpage-loader";
import Toolbar from "./Toolbar";
import DoneGrid from "./DoneGrid";
import Inspector, { InspectorPanel } from "./Inspector";
import {
  colOf,
  deriveBreakdown,
  formatAge,
  formatTokens,
  formatTokensCompact,
  liveStatus,
  matchesFilter,
  normTs,
  type KanbanChangedFile,
  type KanbanColumn,
  type KanbanFilter,
  type KanbanItem,
  type KanbanToolEvent,
  type SessionTokenMap,
} from "./types";

const POLL_MS = 1000;
const WORKFLOW_COLS: KanbanColumn[] = ["thinking", "done"];
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
  const [taskMap, setTaskMap] = useState<Record<string, SubagentTask[]>>({});
  const [toolMap, setToolMap] = useState<Record<string, KanbanToolEvent[]>>({});
  const [fileMap, setFileMap] = useState<Record<string, KanbanChangedFile[]>>({});
  const [liveMap, setLiveMap] = useState<LiveMap>({});
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState<Record<string, KanbanColumn>>({});
  const [filter, setFilter] = useState<KanbanFilter>(EMPTY_FILTER);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  // Total token per sesi root (GET /api/tokens, poll 60s — agregat full-scan
  // message, jangan ikut poll 1s). Fail-open: gagal → map lama dipertahankan.
  const [tokenMap, setTokenMap] = useState<SessionTokenMap>({});

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
            if (typeof v !== "string") continue;
            if ((WORKFLOW_COLS as string[]).includes(v)) wf[k] = v as KanbanColumn;
            else if (v === "progress" || v === "review") wf[k] = "done";
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
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    let loadedOnce = false;
    const started = Date.now();
    let minTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const firstLoad = !loadedOnce;
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
        if (json.active != null) {
          const nextActive = json.active as Record<string, ActiveChild[]>;
          setActiveMap((prev) => (sameKeys(prev, nextActive) ? prev : nextActive));
        }
        if (json.live != null) {
          const nextLive = json.live as LiveMap;
          setLiveMap((prev) => (sameKeys(prev, nextLive) ? prev : nextLive));
        }
        if (json.tasks != null) {
          const nextTasks = json.tasks as Record<string, SubagentTask[]>;
          setTaskMap((prev) => (sameKeys(prev, nextTasks) ? prev : nextTasks));
        }
        if (json.tools != null) {
          const nextTools = json.tools as Record<string, KanbanToolEvent[]>;
          setToolMap((prev) => (sameKeys(prev, nextTools) ? prev : nextTools));
        }
        if (json.changedFiles != null) {
          const nextFiles = json.changedFiles as Record<string, KanbanChangedFile[]>;
          setFileMap((prev) => (sameKeys(prev, nextFiles) ? prev : nextFiles));
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
        loadedOnce = true;
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        if (!alive) return;
        if (firstLoad) {
          const elapsed = Date.now() - started;
          const wait = Math.max(0, 800 - elapsed);
          if (wait > 0) {
            minTimer = setTimeout(() => {
              if (alive) setLoading(false);
            }, wait);
          } else {
            setLoading(false);
          }
          return;
        }
        setLoading(false);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(minTimer);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const loadTokens = async () => {
      try {
        const res = await fetch("/api/tokens", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive || !json.ok || json.tokens?.bySession == null) return;
        const next: SessionTokenMap = {};
        for (const s of json.tokens.bySession as TokenSession[]) {
          next[s.session] = s;
        }
        setTokenMap(next);
      } catch {
        /* abaikan — map terakhir dipertahankan */
      }
    };
    loadTokens();
    const t = setInterval(loadTokens, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  const items: KanbanItem[] = useMemo(() => {
    return rows
      .filter((r) => r.parent_id === null)
      .filter((r) => !hiddenSet.has(r.id) && !hiddenSet.has(agentIdOf(r)))
      .map((r) => {
        const children = activeMap[r.id] ?? [];
        const wf = workflow[r.id] ?? null;
        const liveSince = liveMap[r.id] ?? 0;
        const status = liveStatus(children.length, liveSince, r.time_updated, now, wf);
        const tokens = children.reduce((a, c) => a + (c.tokens || 0), 0);
        const ts = normTs(r.time_updated);
        const ageMs = Math.max(0, now - ts);
        const activeForMs = libActiveForMs(r.time_updated, children.length, liveSince, now);
        const rawCol = colOf(status, wf);
        const col: KanbanColumn = rawCol === "thinking" ? "thinking" : "done";
        const st = tokenMap[r.id] ?? null;
        return {
          id: r.id,
          alias: aliases[r.id] ?? names[r.id] ?? r.agent,
          title: r.title,
          agent: agentKeyOf(r),
          dir: r.directory,
          tokens,
          tokensLabel: formatTokens(tokens),
          totalTokens: st?.total ?? null,
          totalTokensLabel: st ? formatTokensCompact(st.total) : null,
          totalTokensIn: st?.input ?? null,
          totalTokensOut: st?.output ?? null,
          ageMs,
          ageLabel: formatAge(ageMs),
          activeForMs,
          timeUpdated: ts,
          status,
          col,
          activeChildren: children,
          liveSince,
          tasks: taskMap[r.id] ?? [],
          breakdown: deriveBreakdown(tokens, children.length),
          toolHistory: toolMap[r.id] ?? [],
          changedFiles: fileMap[r.id] ?? [],
        } satisfies KanbanItem;
      })
      .sort((a, b) => b.timeUpdated - a.timeUpdated);
  }, [rows, names, activeMap, taskMap, toolMap, fileMap, liveMap, aliases, hiddenSet, workflow, now, tokenMap]);

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
      const nextCol: KanbanColumn = col === "thinking" ? "thinking" : "done";
      const next = { ...workflow, [id]: nextCol };
      setWorkflow(next);
      persist(aliases, hidden, next);
      setFilter((f) => (nextCol === "thinking" ? { ...f, sel: null } : { ...f, sel: id }));
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
    loading,
    handleRename,
    handleDelete,
    handleMove,
  };
}

/** Komposisi standalone OptB: Toolbar + stack thinking + DoneGrid + Inspector modal. */
export default function SessionsKanbanStandalone() {
  const data = useSessionsKanbanData();
  const { items, loading } = data;

  const activeItems = useMemo(
    () =>
      items
        .filter((i) => i.col === "thinking" && matchesFilter(i, data.filter))
        .sort((a, b) => b.timeUpdated - a.timeUpdated),
    [items, data.filter],
  );
  const doneItems = useMemo(
    () =>
      items
        .filter((i) => i.col === "done" && matchesFilter(i, data.filter))
        .sort((a, b) => b.timeUpdated - a.timeUpdated),
    [items, data.filter],
  );
  const doneSelected = useMemo(
    () => doneItems.find((i) => i.id === data.filter.sel) ?? null,
    [doneItems, data.filter.sel],
  );

  return (
    <div className="skan-root w-full">
      {!loading && (
        <div className="content-fade-in">
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
              {activeItems.length === 0 ? (
                <div className="rounded-md border p-3 text-sm opacity-60" style={{ borderColor: "var(--border)" }}>
                  Tidak ada sesi thinking — semua idle
                </div>
              ) : (
                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                  {activeItems.map((item, i) => (
                    <InspectorPanel
                      key={item.id}
                      item={item}
                      className={
                        activeItems.length % 2 === 1 && i === activeItems.length - 1
                          ? "md:col-span-2"
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
              <DoneGrid
                items={items}
                filter={data.filter}
                onSelect={(id) => data.setFilter((f) => ({ ...f, sel: id }))}
                onMove={data.handleMove}
                onRename={data.handleRename}
                onDelete={data.handleDelete}
              />
            </div>
          </main>
          <Inspector
            item={doneSelected}
            open={!!doneSelected}
            onClose={() => data.setFilter((f) => ({ ...f, sel: null }))}
          />
        </div>
      )}
      <FullPageLoader visible={loading} />
    </div>
  );
}
