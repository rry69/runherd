"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActiveChild, LiveMap, SessionRow as ApiSessionRow, SubagentTask, TokenSession } from "@/lib/types";
import { activeForMs as libActiveForMs } from "@/lib/live-status";
import { FullPageLoader } from "@/components/dashboard/fullpage-loader";
import Inspector from "./Inspector";
import SessionRow from "./SessionRow";
import { LinearTabs, LinearTopbar, type LinearTabKey } from "./LinearChrome";
import "./linear.css";
import {
  colOf,
  deriveBreakdown,
  formatAge,
  formatTokens,
  formatTokensCompact,
  liveStatus,
  matchesFilter,
  normTs,
  sessionLiveTotal,
  type KanbanChangedFile,
  type KanbanColumn,
  type KanbanFilter,
  type KanbanItem,
  type KanbanToolEvent,
  type ModelComboMap,
  type SessionModelMap,
  type SessionModelTokenMap,
  type SessionTokenMap,
} from "./types";

// Poll 2s: payload full (tasks/tools/files, scan 52rb messages Hermes)
// + cache server 2s. Ambang live 15s/5mnt → granularitas 2s tak masalah.
const POLL_MS = 2000;
const WORKFLOW_COLS: KanbanColumn[] = ["thinking", "done"];
const EMPTY_FILTER: KanbanFilter = { q: "", chip: null, tab: "all", sel: null };
// Grup idle (Yesterday/Earlier) hanya tampil 5 baris agar tak perlu scroll panjang.
const IDLE_GROUP_LIMIT = 5;

const agentKeyOf = (r: ApiSessionRow) => r.agent || "unknown";
const agentIdOf = (r: ApiSessionRow) => `agent:${agentKeyOf(r)}`;

const sameKeys = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && kb.every((k) => a[k] === b[k]);
};

function useSessionsKanbanData() {
  const [rows, setRows] = useState<ApiSessionRow[]>([]);
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
  const [modelTokenMap, setModelTokenMap] = useState<SessionModelTokenMap>({});
  const [sessionModelMap, setSessionModelMap] = useState<SessionModelMap>({});
  const [comboModelMap, setComboModelMap] = useState<ModelComboMap>({});

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
    let inFlight = false;
    const started = Date.now();
    let minTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
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
        const next = json.data as ApiSessionRow[];
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
        if (json.models != null) {
          const nextModels = json.models as SessionModelMap;
          setSessionModelMap((prev) => (sameKeys(prev, nextModels) ? prev : nextModels));
        }
        if (json.comboModels != null) {
          const nextComboModels = json.comboModels as ModelComboMap;
          setComboModelMap((prev) => (sameKeys(prev, nextComboModels) ? prev : nextComboModels));
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
        inFlight = false;
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
        const byModel: SessionModelTokenMap = {};
        for (const s of json.tokens.bySession as TokenSession[]) {
          next[s.session] = s;
          if (s.models?.length) byModel[s.session] = s.models;
        }
        setTokenMap(next);
        setModelTokenMap(byModel);
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
        const tasks = taskMap[r.id] ?? [];
        // Opsi A: bySession (60s, hanya opencode) bisa null untuk sesi
        // baru/9router → fallback live Σ tasks[].tokens (poll 2s).
        const liveSum = sessionLiveTotal(tasks);
        const total = st?.total ?? liveSum;
        return {
          id: r.id,
          alias: aliases[r.id] ?? names[r.id] ?? r.agent,
          title: r.title,
          agent: agentKeyOf(r),
          // Row dari opencode.db default "opencode"; row Hermes sudah
          // membawa r.source ("hermes") dari API.
          source: ((r as { source?: string }).source ?? "opencode") as KanbanItem["source"],
          model: (() => {
            const model = sessionModelMap[r.id] ?? (r.source === "hermes" && r.agent ? { model: r.agent, provider: "hermes", at: ts } : null);
            return model ? { ...model, model: comboModelMap[model.model] ?? model.model } : null;
          })(),
          modelTokens: (modelTokenMap[r.id] ?? []).map((m) => ({
            ...m,
            model: comboModelMap[m.model] ?? m.model,
          })),
          dir: r.directory,
          tokens,
          tokensLabel: formatTokens(tokens),
          totalTokens: total,
          totalTokensLabel: total != null ? formatTokensCompact(total) : null,
          totalTokensIn: st?.input ?? null,
          totalTokensOut: st?.output ?? null,
          totalTokensLive: st == null && liveSum != null,
          ageMs,
          ageLabel: formatAge(ageMs),
          activeForMs,
          timeUpdated: ts,
          status,
          col,
          activeChildren: children,
          liveSince,
          tasks,
          breakdown: deriveBreakdown(tokens, children.length),
          toolHistory: toolMap[r.id] ?? [],
          changedFiles: fileMap[r.id] ?? [],
        } satisfies KanbanItem;
      })
      .sort((a, b) => b.timeUpdated - a.timeUpdated);
  }, [rows, names, activeMap, taskMap, toolMap, fileMap, liveMap, aliases, hiddenSet, workflow, now, tokenMap, modelTokenMap, sessionModelMap, comboModelMap]);

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

  const handleResetStuck = useCallback(() => {
    const stuckIds = items.filter((i) => i.status === "failed").map((i) => i.id);
    const fresh = stuckIds.filter((id) => !hiddenSet.has(id));
    if (fresh.length === 0) return;
    const next = [...hidden, ...fresh];
    setHidden(next);
    persist(aliases, next, workflow);
    setFilter((f) => (f.sel && fresh.includes(f.sel) ? { ...f, sel: null } : f));
  }, [items, hidden, hiddenSet, aliases, workflow, persist]);

  const stuckCount = useMemo(() => items.filter((i) => i.status === "failed").length, [items]);

  return {
    items,
    agents,
    showing,
    stuckCount,
    filter,
    setFilter,
    error,
    loading,
    handleRename,
    handleDelete,
    handleMove,
    handleResetStuck,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayGroupOf(ageMs: number): string {
  if (ageMs < DAY_MS) return "Today";
  if (ageMs < 2 * DAY_MS) return "Yesterday";
  return "Earlier";
}

function tabOf(filter: KanbanFilter): LinearTabKey {
  if (filter.tab === "build" && !filter.chip) return "build";
  if (filter.tab === "plan" && !filter.chip) return "plan";
  if (filter.chip === "idle") return "idle";
  if (filter.chip === "thinking" && filter.tab === "all") return "unread";
  return "all";
}

/** Komposisi Linear list 1:1 mockup: topbar + tabs + list-header + day-group + rows + footer. */
export default function SessionsKanbanStandalone() {
  const data = useSessionsKanbanData();
  const { items, loading } = data;
  const [showSearch, setShowSearch] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Reset lipatan saat query/chip/tab berubah agar hasil filter selalu ringkas.
  useEffect(() => {
    setExpandedGroups([]);
  }, [data.filter.q, data.filter.chip, data.filter.tab]);

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label],
    );
  }, []);

  const activeTab = tabOf(data.filter);

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((i) => i.status === "thinking").length,
      idle: 0,
      build: 0,
      plan: 0,
    }),
    [items],
  );

  const listed = useMemo(
    () =>
      items.filter((i) => matchesFilter(i, data.filter)).sort((a, b) => b.timeUpdated - a.timeUpdated),
    [items, data.filter],
  );

  const groups = useMemo(() => {
    const out: { label: string; rows: typeof listed }[] = [];
    for (const item of listed) {
      const label = dayGroupOf(item.ageMs);
      const g = out.find((x) => x.label === label);
      if (g) g.rows.push(item);
      else out.push({ label, rows: [item] });
    }
    return out;
  }, [listed]);

  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const allChecked = listed.length > 0 && listed.every((i) => checkedSet.has(i.id));

  const toggleCheck = useCallback((id: string) => {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleCheckAll = useCallback(() => {
    setChecked((prev) => {
      const ids = listed.map((i) => i.id);
      const all = ids.length > 0 && ids.every((id) => prev.includes(id));
      return all ? [] : ids;
    });
  }, [listed]);

  const handleLinearTab = useCallback(
    (t: LinearTabKey) => {
      if (t === "all") data.setFilter((f) => ({ ...f, chip: null, tab: "all" }));
      else if (t === "unread") data.setFilter((f) => ({ ...f, chip: "thinking", tab: "all" }));
      else if (t === "idle") data.setFilter((f) => ({ ...f, chip: "idle", tab: "all" }));
      else if (t === "build") data.setFilter((f) => ({ ...f, chip: null, tab: "build" }));
      else data.setFilter((f) => ({ ...f, chip: null, tab: "plan" }));
    },
    [data],
  );

  const breadcrumb =
    activeTab === "all"
      ? "All sessions"
      : activeTab === "unread"
        ? "Unread"
        : activeTab === "idle"
          ? "Idle"
          : activeTab === "build"
            ? "Build"
            : "Plan";

  const selected = useMemo(
    () => items.find((i) => i.id === data.filter.sel) ?? null,
    [items, data.filter.sel],
  );

  const idleCount = useMemo(
    () => listed.filter((i) => i.status === "idle" || i.status === "done").length,
    [listed],
  );

  return (
    <div className="linear-root w-full">
      {!loading && (
        <div className="content-fade-in">
          <main className="lin-main">
            <LinearTopbar
              filter={data.filter}
              agents={data.agents}
              breadcrumb={breadcrumb}
              onQuery={(q) => data.setFilter((f) => ({ ...f, q }))}
              onChip={(chip) => data.setFilter((f) => ({ ...f, chip: f.chip === chip ? null : chip }))}
              onAgentTab={(tab) => data.setFilter((f) => ({ ...f, tab }))}
              onClear={() => data.setFilter((f) => ({ ...f, q: "", chip: null, tab: "all" }))}
              showSearch={showSearch}
              onToggleSearch={() => setShowSearch((v) => !v)}
            />
            <LinearTabs counts={counts} activeTab={activeTab} onTab={handleLinearTab} />
            <div className="lin-list-container">
              <div className="lin-list-header">
                <div className="lin-list-header-left">
                  <button
                    type="button"
                    aria-label={allChecked ? "Uncheck all" : "Check all"}
                    aria-pressed={allChecked}
                    className={`lin-checkbox${allChecked ? " checked" : ""}`}
                    onClick={toggleCheckAll}
                  >
                    {allChecked ? "✓" : ""}
                  </button>
                  <span>Select all</span>
                </div>
              </div>
              {groups.map((g) => {
                const capped = g.label !== "Today" && !expandedGroups.includes(g.label);
                const visible = capped ? g.rows.slice(0, IDLE_GROUP_LIMIT) : g.rows;
                const hidden = g.rows.length - visible.length;
                return (
                  <div key={g.label}>
                    <div className="lin-day-group">{g.label}</div>
                    {visible.map((item) => (
                      <SessionRow
                        key={item.id}
                        item={item}
                        selected={data.filter.sel === item.id}
                        checked={checkedSet.has(item.id)}
                        onSelect={(id) => data.setFilter((f) => ({ ...f, sel: id }))}
                        onToggleCheck={toggleCheck}
                        onRename={data.handleRename}
                        onDelete={data.handleDelete}
                      />
                    ))}
                    {capped && hidden > 0 && (
                      <button
                        type="button"
                        className="lin-show-more"
                        onClick={() => toggleGroup(g.label)}
                      >
                        Tampilkan {hidden} sesi lainnya di {g.label}
                      </button>
                    )}
                    {!capped && g.label !== "Today" && g.rows.length > IDLE_GROUP_LIMIT && (
                      <button
                        type="button"
                        className="lin-show-more"
                        onClick={() => toggleGroup(g.label)}
                      >
                        Ciutkan {g.label}
                      </button>
                    )}
                  </div>
                );
              })}
              {listed.length === 0 && (
                <div className="lin-list-footer">Tidak ada sesi cocok dengan filter.</div>
              )}
              {listed.length > 0 && (
                <div className="lin-list-footer">
                  {data.error
                    ? `API error: ${data.error} — menampilkan data terakhir (fail-open).`
                    : `Showing ${listed.length} of ${items.length} sessions · ${idleCount} idle`}
                </div>
              )}
            </div>
          </main>
          <Inspector
            item={selected}
            open={!!selected}
            onClose={() => data.setFilter((f) => ({ ...f, sel: null }))}
          />
        </div>
      )}
      <FullPageLoader visible={loading} />
    </div>
  );
}
