"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import dagre from "dagre";
import { Input } from "@/components/ui/input";
import {
  SessionHiddenToolbar,
  SessionNode,
  SessionUndoToast,
  type SessionNodeDataExt,
} from "./SessionNode";
import type { SessionRow } from "@/lib/types";

const PAGE_SIZE = 50;

const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();

const nodeTypes = { session: SessionNode };

function layoutLR(nodes: Node<SessionNodeDataExt>[], edges: Edge[]): Node<SessionNodeDataExt>[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 220 });
  g.setDefaultEdgeLabel(() => ({}));
  const W = 240;
  const H = 110;
  for (const n of nodes) g.setNode(n.id, { width: W, height: H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - W / 2, y: p.y - H / 2 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
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
  const [filterDir, setFilterDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<UndoState | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

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
        // Merge tanpa reset expand/collapse: rows diganti dari API,
        // state collapsed/displayLimit dipertahankan terpisah.
        setRows((prev) => {
          if (prev.length === 0) return next;
          if (prev.length === next.length && prev.every((r, i) => r.id === next[i]?.id && r.time_updated === next[i]?.time_updated)) return prev;
          return next;
        });
        setFilterDir((prev) => {
          if (prev) return prev;
          const cur = next.find((r) =>
            norm(r.directory).includes("c:/project/dashboard-agent"),
          );
          return cur?.directory ?? "";
        });
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    load();
    const t = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Reset pagination saat filter berubah (bukan saat polling).
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [filterDir]);

  const dirs = useMemo(
    () => Array.from(new Set(rows.map((r) => r.directory))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = norm(filterDir);
    return q ? rows.filter((r) => norm(r.directory).includes(q)) : rows;
  }, [rows, filterDir]);

  const { byId, childrenMap, depthMap } = useMemo(() => {
    const byId = new Map(filtered.map((r) => [r.id, r]));
    const childrenMap = new Map<string, SessionRow[]>();
    for (const r of filtered) {
      if (r.parent_id && byId.has(r.parent_id)) {
        const list = childrenMap.get(r.parent_id!) ?? [];
        list.push(r);
        childrenMap.set(r.parent_id!, list);
      }
    }
    // Depth via BFS dari roots agar stabil untuk dagre + default collapse.
    const depthMap = new Map<string, number>();
    const roots = filtered.filter((r) => !r.parent_id || !byId.has(r.parent_id!));
    const queue: { id: string; d: number }[] = roots.map((r) => ({ id: r.id, d: 0 }));
    for (const r of roots) depthMap.set(r.id, 0);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const ch of childrenMap.get(cur.id) ?? []) {
        if (!depthMap.has(ch.id)) {
          depthMap.set(ch.id, cur.d + 1);
          queue.push({ id: ch.id, d: cur.d + 1 });
        }
      }
    }
    for (const r of filtered) if (!depthMap.has(r.id)) depthMap.set(r.id, 0);
    return { byId, childrenMap, depthMap };
  }, [filtered]);

  // Default collapse depth>0 untuk id baru; tidak mereset expand user saat polling.
  useEffect(() => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const r of filtered) {
        if (seenRef.current.has(r.id)) continue;
        seenRef.current.add(r.id);
        if ((depthMap.get(r.id) ?? 0) > 0 && !next.has(r.id)) {
          next.add(r.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filtered, depthMap]);

  const toggleNode = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  void toggleNode;

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    setCollapsed(new Set([...childrenMap.keys()]));
  }, [childrenMap]);

  const hiddenCountMap = useMemo(() => {
    const map = new Map<string, number>();
    const count = (id: string, visiting = new Set<string>()): number => {
      if (visiting.has(id)) return 0;
      visiting.add(id);
      let n = 0;
      for (const ch of childrenMap.get(id) ?? []) {
        n += 1 + count(ch.id, visiting);
      }
      visiting.delete(id);
      return n;
    };
    for (const id of childrenMap.keys()) map.set(id, count(id));
    return map;
  }, [childrenMap]);

  // Hidden cascade: node dianggap hidden bila dirinya atau salah satu
  // ancestor-nya ada di hiddenIds. Turunan dari parent hidden ikut sembunyi.
  const isAncestorHidden = useCallback(
    (r: SessionRow): boolean => {
      let cur = r;
      let guard = 0;
      while (cur.parent_id && byId.has(cur.parent_id) && guard < 50) {
        if (hiddenIds.has(cur.parent_id)) return true;
        cur = byId.get(cur.parent_id)!;
        guard += 1;
      }
      return false;
    },
    [byId, hiddenIds],
  );

  const isEffectivelyHidden = useCallback(
    (r: SessionRow): boolean => hiddenIds.has(r.id) || isAncestorHidden(r),
    [hiddenIds, isAncestorHidden],
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
      const fallback = trimmed || byId.get(id)?.agent || id.slice(0, 8);
      showUndo(`Rename → ${fallback}`, prev, prevHidden);
    },
    [aliases, hiddenIds, persist, showUndo, byId],
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
      // Alias fallback untuk pesan toast bila belum ada alias.
      const name = aliases[id] ?? byId.get(id)?.agent ?? id.slice(0, 8);
      showUndo(next.has(id) ? `Sembunyikan ${name}` : `Tampilkan ${name}`, prev, prevHidden);
    },
    [aliases, hiddenIds, persist, showUndo, byId],
  );

  const handleDelete = useCallback(
    (id?: string) => {
      if (!id) return;
      // Soft-delete cascade via hidden: parent disembunyikan,
      // hidden cascade menyembunyikan seluruh turunan.
      if (hiddenIds.has(id)) return;
      const prev = { ...aliases };
      const prevHidden = new Set(hiddenIds);
      const next = new Set(hiddenIds);
      next.add(id);
      setHiddenIds(next);
      persist(aliases, next);
      const name = aliases[id] ?? byId.get(id)?.agent ?? id.slice(0, 8);
      showUndo(`Hapus ${name}`, prev, prevHidden);
    },
    [aliases, hiddenIds, persist, showUndo, byId],
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

  // Filter nodes/edges by visibility: subtree collapsed disembunyikan,
  // plus hidden cascade (turunan parent hidden disembunyikan).
  // Node yang hidden langsung tetap dirender (dim + badge) agar bisa unhide
  // per-node; turunannya yang difilter.
  const visibleRows = useMemo(() => {
    const isCollapsedHidden = (r: SessionRow): boolean => {
      let cur = r;
      let guard = 0;
      while (cur.parent_id && byId.has(cur.parent_id) && guard < 50) {
        if (collapsed.has(cur.parent_id)) return true;
        cur = byId.get(cur.parent_id)!;
        guard += 1;
      }
      return false;
    };
    return filtered.filter((r) => !isCollapsedHidden(r) && !isAncestorHidden(r));
  }, [filtered, byId, collapsed, isAncestorHidden]);

  const overrideHiddenCount = useMemo(
    () => filtered.filter((r) => isEffectivelyHidden(r)).length,
    [filtered, isEffectivelyHidden],
  );

  const pagedRows = useMemo(
    () => visibleRows.slice(0, displayLimit),
    [visibleRows, displayLimit],
  );
  const pagedIds = useMemo(() => new Set(pagedRows.map((r) => r.id)), [pagedRows]);

  const { nodes, edges } = useMemo(() => {
    const rawNodes: Node<SessionNodeDataExt>[] = pagedRows.map((r) => {
      return {
        id: r.id,
        type: "session",
        position: { x: 0, y: 0 },
        data: {
          label: r.id.slice(0, 8),
          agent: r.agent,
          title: r.title,
          status: "idle",
          directory: r.directory,
          // Alias fallback: undefined → SessionNode pakai data.agent.
          alias: aliases[r.id] ?? undefined,
          hidden: isEffectivelyHidden(r),
          childCount: hiddenCountMap.get(r.id) ?? 0,
          onRename: handleRename,
          onDelete: handleDelete,
          onToggle: handleToggleHide,
        },
      };
    });
    const rawEdges: Edge[] = pagedRows
      .filter((r) => r.parent_id && pagedIds.has(r.parent_id!))
      .map((r) => ({
        id: `${r.parent_id}->${r.id}`,
        source: r.parent_id!,
        target: r.id,
        type: "smoothstep",
      }));
    return { nodes: layoutLR(rawNodes, rawEdges), edges: rawEdges };
  }, [
    pagedRows,
    pagedIds,
    aliases,
    isEffectivelyHidden,
    hiddenCountMap,
    handleRename,
    handleDelete,
    handleToggleHide,
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          list="dashboard-dirs"
          placeholder="Filter directory…"
          value={filterDir}
          onChange={(e) => setFilterDir(e.target.value)}
        />
        <datalist id="dashboard-dirs">
          {dirs.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <button
          className="h-9 shrink-0 rounded-md border px-3 text-sm"
          onClick={() => setFilterDir("")}
        >
          Semua
        </button>
        <button
          className="h-9 shrink-0 rounded-md border px-3 text-sm"
          onClick={expandAll}
        >
          Expand
        </button>
        <button
          className="h-9 shrink-0 rounded-md border px-3 text-sm"
          onClick={collapseAll}
        >
          Collapse
        </button>
        <SessionHiddenToolbar hiddenCount={overrideHiddenCount} onShowAll={handleShowAll} />
        <span className="shrink-0 text-xs opacity-60">
          {rows.length} sesi · {visibleRows.length} tampil · {nodes.length} loaded
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
      {!error && rows.length > 0 && nodes.length === 0 && (
        <div className="rounded-md border p-3 text-sm opacity-60">
          Filter tidak cocok dengan {rows.length} sesi. Kosongkan filter atau
          pilih directory dari daftar.
        </div>
      )}
      <div className="h-[70vh] rounded-lg border">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {toast && (
        <SessionUndoToast
          key={toast.key}
          message={toast.message}
          onUndo={handleUndo}
          onClose={() => setToast(null)}
        />
      )}
      {visibleRows.length > displayLimit && (
        <button
          className="h-9 rounded-md border px-3 text-sm"
          onClick={() => setDisplayLimit((v) => v + PAGE_SIZE)}
        >
          Muat 50 lagi ({visibleRows.length - displayLimit} tersisa)
        </button>
      )}
    </div>
  );
}
