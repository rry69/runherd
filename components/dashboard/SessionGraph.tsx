"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import ReactFlow, {
  Controls,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import dagre from "dagre";
import {
  SessionHiddenToolbar,
  SessionNode,
  SessionUndoToast,
  type SessionNodeDataExt,
} from "./SessionNode";
import { TooltipProvider } from "@/components/ui/tooltip";
import DotGrid from "@/components/backgrounds/dot-grid";
import type { ActiveChild, SessionRow } from "@/lib/types";

const STALE_MS = 24 * 3600 * 1000;
const MAX_AGENTS = 6;
const PER_AGENT = 4;

const agentKeyOf = (r: SessionRow) => r.agent || "unknown";
const agentIdOf = (r: SessionRow) => `agent:${agentKeyOf(r)}`;

const nodeTypes = { session: SessionNode };

function layoutTB(nodes: Node<SessionNodeDataExt>[], edges: Edge[]): Node<SessionNodeDataExt>[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 150 });
  g.setDefaultEdgeLabel(() => ({}));
  const W = 240;
  const H = 110;
  for (const n of nodes) {
    const isAgent = n.id.startsWith("agent:");
    g.setNode(n.id, { width: W, height: H, rank: isAgent ? 1 : 0 });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - W / 2, y: p.y - H / 2 },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });
}

type UndoState = {
  key: number;
  message: string;
  prevAliases: Record<string, string>;
  prevHidden: string[];
};

export function SessionGraph() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [activeMap, setActiveMap] = useState<Record<string, ActiveChild[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<UndoState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";

  // Load overrides sekali saat mount: alias + hidden.
  useEffect(() => {
    let alive = true;
    fetch("/api/overrides", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        setAliases(json.aliases ?? {});
        setHiddenIds(new Set<string>(json.hidden ?? []));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback(
    async (nextAliases: Record<string, string>, nextHidden: Set<string>) => {
      try {
        await fetch("/api/overrides", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aliases: nextAliases,
            hidden: [...nextHidden],
          }),
        });
      } catch {
        // polling berikutnya / load ulang akan menimpa; abaikan error PUT.
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/sessions?lite=1", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!json.ok) {
          setError(json.error ?? "API gagal");
          return;
        }
        setError(null);
        const next = json.data as SessionRow[];
        setNames((json.names ?? {}) as Record<string, string>);
        // Fail-open: field `active` hilang saat DB error → pertahankan
        // activeMap terakhir (tetap thinking), jangan timpa kosong.
        if (json.active) setActiveMap(json.active as Record<string, ActiveChild[]>);
        setRows((prev) => {
          if (prev.length === 0) return next;
          if (prev.length === next.length && prev.every((r, i) => r.id === next[i]?.id && r.time_updated === next[i]?.time_updated)) return prev;
          return next;
        });
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        inFlight = false;
      }
    };
    load();
    const t = setInterval(load, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const parents = useMemo(
    () => rows.filter((r) => r.parent_id === null),
    [rows],
  );

  const byId = useMemo(() => new Map(parents.map((r) => [r.id, r])), [parents]);

  // Agregasi Agent -> Sesi (2 level). Hitung dari parent; aktivitas child
  // sudah di-bubble ke parent via /api/sessions {active} (getActiveChildren).
  const groupCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of parents) {
      const k = agentKeyOf(r);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [parents]);

  // max(time_updated) per-agent dari SEMUA rows (parent+child) untuk
  // filter "sedang digunakan" — generik, tanpa hardcode nama agent.
  const agentMaxTs = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const t = r.time_updated < 1e12 ? r.time_updated * 1000 : r.time_updated;
      const k = agentKeyOf(r);
      if (t > (map.get(k) ?? 0)) map.set(k, t);
    }
    return map;
  }, [rows]);

  // Hidden cascade 2 level: sesi hidden bila dirinya atau node agregasi
  // Agent-nya ada di hiddenIds. Sesi di bawah agent hidden disembunyikan;
  // sesi hidden langsung tetap dirender (dim + badge) agar bisa unhide.
  const isEffectivelyHidden = useCallback(
    (r: SessionRow): boolean => hiddenIds.has(r.id) || hiddenIds.has(agentIdOf(r)),
    [hiddenIds],
  );

  const visibleParents = useMemo(
    () => parents.filter((r) => !hiddenIds.has(agentIdOf(r))),
    [parents, hiddenIds],
  );

  const overrideHiddenCount = useMemo(
    () => parents.filter((r) => isEffectivelyHidden(r)).length,
    [parents, isEffectivelyHidden],
  );

  const showUndo = useCallback(
    (
      message: string,
      prevAliases: Record<string, string>,
      prevHidden: Set<string>,
    ) => {
      setToast({
        key: Date.now(),
        message,
        prevAliases: { ...prevAliases },
        prevHidden: [...prevHidden],
      });
    },
    [],
  );

  const handleUndo = useCallback(() => {
    setToast((cur) => {
      if (!cur) return cur;
      setAliases(cur.prevAliases);
      const restored = new Set(cur.prevHidden);
      setHiddenIds(restored);
      persist(cur.prevAliases, restored);
      return null;
    });
  }, [persist]);

  const handleRename = useCallback(
    (id?: string, nextAlias?: string) => {
      if (!id) return;
      const prev = { ...aliases };
      const prevHidden = new Set(hiddenIds);
      const trimmed = (nextAlias ?? "").trim();
      const next = { ...aliases };
      if (!trimmed) delete next[id];
      else next[id] = trimmed;
      setAliases(next);
      persist(next, hiddenIds);
      const fallback = trimmed || (aliases[id] ?? names[id] ?? byId.get(id)?.agent ?? id.slice(0, 8));
      showUndo(`Rename → ${fallback}`, prev, prevHidden);
    },
    [aliases, hiddenIds, persist, showUndo, byId, names],
  );

  const handleToggleHide = useCallback(
    (id?: string) => {
      if (!id) return;
      const prev = { ...aliases };
      const prevHidden = new Set(hiddenIds);
      const next = new Set(hiddenIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setHiddenIds(next);
      persist(aliases, next);
      const name = aliases[id] ?? names[id] ?? byId.get(id)?.agent ?? id.slice(0, 8);
      showUndo(next.has(id) ? `Sembunyikan ${name}` : `Tampilkan ${name}`, prev, prevHidden);
    },
    [aliases, hiddenIds, persist, showUndo, byId, names],
  );

  const handleDelete = useCallback(
    (id?: string) => {
      if (!id) return;
      // Soft-delete via hidden: hapus agregasi Agent menyembunyikan
      // seluruh sesinya (cascade 2 level).
      if (hiddenIds.has(id)) return;
      const prev = { ...aliases };
      const prevHidden = new Set(hiddenIds);
      const next = new Set(hiddenIds);
      next.add(id);
      setHiddenIds(next);
      persist(aliases, next);
      const name = aliases[id] ?? names[id] ?? byId.get(id)?.agent ?? id.slice(0, 8);
      showUndo(`Hapus ${name}`, prev, prevHidden);
    },
    [aliases, hiddenIds, persist, showUndo, byId, names],
  );

  const handleShowAll = useCallback(() => {
    if (hiddenIds.size === 0) return;
    const prev = { ...aliases };
    const prevHidden = new Set(hiddenIds);
    const next = new Set<string>();
    setHiddenIds(next);
    persist(aliases, next);
    showUndo("Tampilkan semua sesi", prev, prevHidden);
  }, [aliases, hiddenIds, persist, showUndo]);

  // now = state + interval agar useMemo tetap pure (tanpa Date.now di render).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const visibleAgents = useMemo(() => {
    const groups = new Map<string, SessionRow[]>();
    for (const r of visibleParents) {
      const k = agentKeyOf(r);
      const list = groups.get(k) ?? [];
      list.push(r);
      groups.set(k, list);
    }
    const entries = [...groups.entries()].map(([agentKey, list]) => {
      const agentActive = list.flatMap((r) => activeMap[r.id] ?? []);
      const maxTs = agentMaxTs.get(agentKey) ?? 0;
      return { agentKey, list, agentActive, maxTs };
    }).filter((e) => e.agentActive.length > 0 || now - e.maxTs < STALE_MS);
    entries.sort(
      (a, b) =>
        (b.agentActive.length > 0 ? 1 : 0) - (a.agentActive.length > 0 ? 1 : 0) ||
        b.maxTs - a.maxTs,
    );
    return entries.slice(0, MAX_AGENTS);
  }, [visibleParents, activeMap, agentMaxTs, now]);

  const { nodes, edges } = useMemo(() => {
    // Agregasi per-agent yang sudah difilter+cap. displayName =
    // overrides.aliases > /api/sessions {names} > agent. activeChildren
    // per parentId dari /api/sessions {active}; agregat aktif bila ada
    // child aktif. Sesi: parent 4 newest ORDER time_updated DESC per-agent.
    const normTs = (t: number) => (t < 1e12 ? t * 1000 : t);
    const rawNodes: Node<SessionNodeDataExt>[] = [];
    const rawEdges: Edge[] = [];
    for (const { agentKey, list, agentActive } of visibleAgents) {
      const agentId = `agent:${agentKey}`;
      const recent = [...list].sort((a, b) => normTs(b.time_updated) - normTs(a.time_updated)).slice(0, PER_AGENT);
      const first = recent[0] ?? list[0]!;
      rawNodes.push({
        id: agentId,
        type: "session",
        position: { x: 0, y: 0 },
        data: {
          label: aliases[agentId] ?? agentKey,
          agent: agentKey,
          title: `${list.length} sesi`,
          status: agentActive.length > 0 ? "thinking" : "idle",
          directory: first.directory,
          alias: aliases[agentId] ?? undefined,
          hidden: hiddenIds.has(agentId),
          childCount: groupCounts.get(agentKey) ?? list.length,
          isAggregate: true,
          activeChildren: agentActive,
          onRename: handleRename,
          onDelete: handleDelete,
          onToggle: handleToggleHide,
        },
      });
      for (const r of recent) {
        const display = aliases[r.id] ?? names[r.id] ?? r.agent;
        const children = activeMap[r.id] ?? [];
        rawNodes.push({
          id: r.id,
          type: "session",
          position: { x: 0, y: 0 },
          data: {
            label: display,
            agent: r.agent,
            title: r.title,
            status: children.length > 0 ? "thinking" : "idle",
            directory: r.directory,
            alias: display,
            hidden: isEffectivelyHidden(r),
            childCount: 0,
            activeChildren: children,
            timeUpdated: normTs(r.time_updated),
            onRename: handleRename,
            onDelete: handleDelete,
            onToggle: handleToggleHide,
          },
        });
        rawEdges.push({
          id: `${r.id}->${agentId}`,
          source: r.id,
          target: agentId,
          type: "smoothstep",
        });
      }
    }
    return { nodes: layoutTB(rawNodes, rawEdges), edges: rawEdges };
  }, [
    visibleAgents,
    aliases,
    hiddenIds,
    groupCounts,
    names,
    activeMap,
    isEffectivelyHidden,
    handleRename,
    handleDelete,
    handleToggleHide,
  ]);

  return (
    <div id="sessions" className="flex scroll-mt-16 flex-col gap-3">
      <div className="flex items-center gap-2">
        <SessionHiddenToolbar hiddenCount={overrideHiddenCount} onShowAll={handleShowAll} />
        <span className="shrink-0 text-xs opacity-60">
          {rows.length} sesi · {visibleParents.length} tampil · {visibleAgents.length} agent · {nodes.length} loaded
        </span>
      </div>
      {error && (
        <div className="rounded-md border border-red-500 p-3 text-sm text-red-500">
          API error: {error}
        </div>
      )}
      {!error && rows.length === 0 && (
        <div className="rounded-md border p-3 text-sm opacity-60">
          Memuat sesi…
        </div>
      )}
      {!error && rows.length > 0 && nodes.every((n) => n.data.status !== "thinking") && (
        <div className="rounded-md border p-3 text-sm opacity-60">
          Tidak ada sesi thinking aktif
        </div>
      )}
      <div className="relative h-[calc(100svh-12rem)] overflow-hidden rounded-lg border border-foreground/10 bg-transparent">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <DotGrid
            baseColor={isLight ? "#B9AEE0" : "#453A5C"}
            activeColor={isLight ? "#5B4A8A" : "#8B7BB8"}
            gap={24}
            dotSize={1.9}
            proximity={170}
            className="!p-0"
          />
        </div>
        <TooltipProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            className="relative z-10 !bg-transparent"
          >
            <Controls />
          </ReactFlow>
        </TooltipProvider>
      </div>
      {toast && (
        <SessionUndoToast
          key={toast.key}
          message={toast.message}
          onUndo={handleUndo}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
