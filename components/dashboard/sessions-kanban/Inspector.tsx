"use client";

import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatAge, formatDuration, formatTokens, type KanbanItem, type KanbanStatus } from "./types";
import type { SubagentTask } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FileDiff } from "./FileDiff";

type InspectorProps = {
  item: KanbanItem | null;
  open: boolean;
  onClose: () => void;
};

/* Linear Issue View (Mockup A): flat, hairline, tanpa glow/sheen/sweep.
   Font sans = Poppins (global), mono = Geist Mono. Tipe dibedakan via dot. */
const LIN_STYLE = `
@keyframes lin-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.lin-pulse { animation: lin-pulse 1.6s ease-in-out infinite; }
.inspector-divider { border-color: color-mix(in srgb, var(--primary) 28%, var(--border)) !important; }
.inspector-row { border-color: color-mix(in srgb, var(--primary) 20%, var(--border)) !important; }
.inspector-metric-grid { border: 1px solid color-mix(in srgb, var(--primary) 58%, var(--border)) !important; background: color-mix(in srgb, var(--primary) 58%, var(--border)) !important; }
.inspector-metric-cell { background: var(--card) !important; }
@media (prefers-reduced-motion: reduce) { .lin-pulse { animation: none; } }
`;

/** Label status tabel: polos tanpa dot (Mockup A). */
const TASK_STATUS_LABEL: Record<string, string> = {
  running: "live",
  error: "error",
  done: "done",
  completed: "done",
};

function taskStatusLabel(s: string): string {
  return TASK_STATUS_LABEL[s] ?? s;
}

type AgentMeta = {
  label: string;
  dot: string;
};

/** Meta tipe REAL dari data tasks — dot desaturasi + label abu (Mockup A). */
const TYPE_META: Record<string, AgentMeta> = {
  general: { label: "General", dot: "bg-emerald-500" },
  explore: { label: "Explore", dot: "bg-sky-500" },
  explorer: { label: "Explorer", dot: "bg-cyan-500" },
  build: { label: "Build", dot: "bg-amber-500" },
  unknown: { label: "Unknown", dot: "bg-zinc-500" },
  main: { label: "Main", dot: "bg-violet-500" },
};

function normAgent(a: string): string {
  const k = a.trim().toLowerCase();
  return k || "unknown";
}

function metaFor(agent: string): AgentMeta {
  return TYPE_META[normAgent(agent)] ?? TYPE_META.unknown;
}

function agentLabel(agent: string): string {
  const k = normAgent(agent);
  if (TYPE_META[k]) return TYPE_META[k].label;
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function taskName(t: SubagentTask): string {
  if ((t.title ?? "").trim()) return (t.title ?? "").trim();
  if (t.description.trim()) return t.description.trim();
  if (t.childSessionId) return t.childSessionId.slice(0, 8);
  return t.agent;
}

function cleanReport(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Status pill sesi (Mockup A: bg-muted, hairline, radius full) ── */
const SESSION_STATUS_META: Record<KanbanStatus, { label: string; dot: string }> = {
  done: { label: "Done", dot: "bg-emerald-500" },
  idle: { label: "Idle", dot: "bg-muted-foreground" },
  thinking: { label: "Live", dot: "bg-blue-500" },
  queued: { label: "Queued", dot: "bg-amber-500" },
  failed: { label: "Failed", dot: "bg-red-500" },
};

/** `◈ 35.042 · in 28.110 · out 6.932` (mockup) — mono 11.5px muted. */
function SessionMetaLine({ item }: { item: KanbanItem }) {
  if (item.totalTokens == null) return null;
  const inOut =
    item.totalTokensIn != null && item.totalTokensOut != null
      ? ` · in ${item.totalTokensIn.toLocaleString("id-ID")} · out ${item.totalTokensOut.toLocaleString("id-ID")}`
      : "";
  const title = item.totalTokensLive
    ? `Total live Σ subagent: ${item.totalTokens.toLocaleString("id-ID")} (akumulasi bySession belum ada)`
    : `Total sesi: ${item.totalTokens.toLocaleString("id-ID")}`;
  return (
    <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground" title={title}>
      ◈ {item.totalTokens.toLocaleString("id-ID")}
      {inOut}
    </span>
  );
}

function ModelLine({ item }: { item: KanbanItem }) {
  const models = item.modelTokens.length
    ? item.modelTokens
    : item.model
      ? [{ ...item.model, total: 0, input: 0, output: 0 }]
      : [];
  if (models.length === 0) return null;

  const visible = models.slice(0, 3);
  const hiddenCount = Math.max(0, models.length - visible.length);
  return (
    <div className="lin-inspector-models" aria-label="Session models">
      <span className="lin-inspector-model-label">MODEL</span>
      <div className="lin-inspector-model-list">
        {visible.map((model) => {
          const title = model.total > 0
            ? `${model.total.toLocaleString("id-ID")} tokens · in ${model.input.toLocaleString("id-ID")} · out ${model.output.toLocaleString("id-ID")}`
            : `${model.model} · ${model.provider}`;
          return <span className="lin-inspector-model" key={`${model.model}:${model.provider}`} title={title}>{model.model}</span>;
        })}
        {hiddenCount > 0 && <span className="lin-inspector-model-more" title={models.slice(3).map((model) => model.model).join(", ")}>+{hiddenCount}</span>}
      </div>
    </div>
  );
}

function InspectorBody({ item }: { item: KanbanItem | null }) {
  const [filter, setFilter] = useState("semua");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [patchCache, setPatchCache] = useState<
    Record<string, { patch: string | null; truncated: boolean; loading: boolean; error: string | null }>
  >({});

  // Ganti sesi → reset expand/cache (render-time adjust, bukan effect:
  // poll 1s update `item` tapi id sama → tidak reset).
  const itemId = item?.id ?? null;
  const [prevItemId, setPrevItemId] = useState(itemId);
  if (itemId !== prevItemId) {
    setPrevItemId(itemId);
    setExpandedFile(null);
    setShowAllFiles(false);
    setPatchCache({});
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tasks = useMemo(() => item?.tasks ?? [], [item]);

  const filters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      const k = normAgent(t.agent);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const rest = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return [
      { value: "semua", label: "Semua", n: tasks.length },
      ...rest.map(([k, n]) => ({ value: k, label: agentLabel(k), n })),
    ];
  }, [tasks]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter !== "semua" && normAgent(t.agent) !== filter) return false;
      if (!q) return true;
      return `${t.agent} ${t.title ?? ""} ${t.description} ${t.childSessionId ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [tasks, filter, query]);

  const selected: SubagentTask | null = useMemo(() => {
    if (selectedId) {
      const byStable = tasks.find((t) => (t.childSessionId ?? `${t.parentSessionId ?? "?"}-${t.startedAt}`) === selectedId);
      if (byStable) return byStable;
    }
    return visible[0] ?? tasks[0] ?? null;
  }, [tasks, visible, selectedId]);

  // ↑↓/j/k pindah baris terpilih. Skip saat fokus di input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const down = e.key === "ArrowDown" || e.key === "j";
      const up = e.key === "ArrowUp" || e.key === "k";
      if (!down && !up) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (visible.length === 0) return;
      e.preventDefault();
      const cur = visible.findIndex((t) => t === selected);
      const next = cur === -1 ? 0 : Math.min(visible.length - 1, Math.max(0, cur + (down ? 1 : -1)));
      setSelectedId(visible[next].childSessionId ?? `${visible[next].parentSessionId ?? "?"}-${visible[next].startedAt}`);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, selected]);

  const distinctTools = useMemo(() => {
    const s = new Set<string>();
    for (const c of item?.activeChildren ?? []) {
      if (c.tool) s.add(c.tool);
    }
    return [...s].sort();
  }, [item]);

  const breakdown = item?.breakdown ?? ([0, 0, 0] as [number, number, number]);
  const breakdownTotal = breakdown[0] + breakdown[1] + breakdown[2];
  const breakdownSegs = [
    { label: "aktif", value: breakdown[0], cls: "bg-primary" },
    { label: "tool", value: breakdown[1], cls: "bg-muted-foreground/50" },
    { label: "idle", value: breakdown[2], cls: "bg-muted" },
  ].map((s) => ({ ...s, width: breakdownTotal > 0 ? (s.value / breakdownTotal) * 100 : 0 }));

  const matchedActive = selected
    ? (item?.activeChildren.find((c) => Boolean(selected.childSessionId) && (c.sessionId === selected.childSessionId)) ?? null)
    : null;

  // Lazy fetch patch per file (Opsi A): hanya saat expand, tidak ikut poll 1s.
  const toggleFile = (f: { file: string; source: string }) => {
    if (expandedFile === f.file) {
      setExpandedFile(null);
      return;
    }
    setExpandedFile(f.file);
    const cached = patchCache[f.file];
    if (cached && (cached.patch != null || cached.error || cached.loading)) return;
    if (f.source === "write") {
      setPatchCache((p) => ({ ...p, [f.file]: { patch: null, truncated: false, loading: false, error: "file baru" } }));
      return;
    }
    if (!itemId) return;
    setPatchCache((p) => ({ ...p, [f.file]: { patch: null, truncated: false, loading: true, error: null } }));
    fetch(`/api/sessions/diff?session=${encodeURIComponent(itemId)}&file=${encodeURIComponent(f.file)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && typeof d.patch === "string") {
          setPatchCache((p) => ({ ...p, [f.file]: { patch: d.patch, truncated: !!d.truncated, loading: false, error: null } }));
        } else {
          setPatchCache((p) => ({
            ...p,
            [f.file]: { patch: null, truncated: false, loading: false, error: "tidak tersedia" },
          }));
        }
      })
      .catch(() => {
        setPatchCache((p) => ({ ...p, [f.file]: { patch: null, truncated: false, loading: false, error: "gagal" } }));
      });
  };

  if (!item) {
    return (
      <div className="p-5">
        <style>{LIN_STYLE}</style>
        <p className="font-sans text-sm font-semibold">Belum ada seleksi</p>
        <p className="pt-0.5 font-sans text-[13px] text-muted-foreground">Klik kartu untuk melihat detail live.</p>
      </div>
    );
  }

  const selMeta = selected ? metaFor(selected.agent) : null;
  const selAge = selected ? formatAge(Math.max(0, now - selected.startedAt)) : "—";
  const selDur = selected ? formatDuration(selected.durationMs ?? Math.max(0, now - selected.startedAt)) : "—";
  const selTokensRaw = selected?.tokens ?? matchedActive?.tokens ?? null;
  const selTokens = selTokensRaw != null ? formatTokens(selTokensRaw) : "—";
  const desc = selected?.description.trim() ?? "";
  const errorClean = selected?.errorText ? cleanReport(selected.errorText) : "";
  const selTools: string[] = selected?.tools ?? [];
  const toolBadges =
    selTools.length > 0
      ? selTools.slice(0, 6)
      : distinctTools.length > 0
        ? distinctTools.slice(0, 6)
        : ["task"];

  return (
    <div className="flex min-h-0 flex-1 flex-col font-sans">
      <style>{LIN_STYLE}</style>

      {/* ── Breakdown: bar 4px + legend mono (Mockup A) ── */}
      <div className="shrink-0 border-b border-border bg-background px-5 pb-3 pt-3.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">breakdown</p>
        <div
          className="mt-2 flex h-1 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Breakdown sesi: aktif ${breakdown[0]}, tool ${breakdown[1]}, idle ${breakdown[2]}`}
        >
          {breakdownSegs.map((s) => (
            <span key={s.label} className={cn("block h-full", s.cls)} style={{ width: `${s.width}%` }} />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3.5 font-mono text-[11px] text-muted-foreground">
          {breakdownSegs.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 tabular-nums">
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", s.cls)} />
              {s.label} {s.value}%
            </span>
          ))}
        </div>
      </div>

      {/* ── File heat: top file berubah, bukan gimik — dari getChangedFiles ── */}
      {(() => {
        const files = (item?.changedFiles ?? [])
          .filter((f) => f.source !== "patch-list")
          .map((f) => ({ ...f, heat: f.added + f.deleted }))
          .sort((a, b) => b.heat - a.heat);
        if (!item || files.length === 0) return null;
        const top = showAllFiles ? files : files.slice(0, 5);
        const max = Math.max(1, top[0].heat);
        const totalAdd = files.reduce((s, f) => s + f.added, 0);
        const totalDel = files.reduce((s, f) => s + f.deleted, 0);
        return (
          <div className="inspector-divider shrink-0 border-b border-border bg-card px-5 pb-3 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                file churn · {files.length} file
              </p>
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                <span className="text-emerald-500">+{totalAdd.toLocaleString("id-ID")}</span>
                {" / "}
                <span className="text-red-400">-{totalDel.toLocaleString("id-ID")}</span>
              </p>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5" aria-label="File paling banyak berubah">
              {top.map((f) => (
                <li key={f.file} className="min-w-0" title={`${f.file} · +${f.added} -${f.deleted}`}>
                  <button
                    type="button"
                    onClick={() => toggleFile(f)}
                    aria-expanded={expandedFile === f.file}
                    className="block w-full text-left"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[11.5px] text-foreground/90">
                        {f.file.split("/").slice(-2).join("/")}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                        +{f.added} -{f.deleted}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(4, (f.heat / max) * 100)}%` }}
                      />
                    </div>
                  </button>
                  {expandedFile === f.file && (
                    <div className="mt-1.5 max-h-[32vh] min-w-0 overflow-y-auto border-l-2 border-border py-0.5 pl-2.5 pr-1">
                      {(() => {
                        const c = patchCache[f.file];
                        if (!c || c.loading) {
                          return (
                            <div className="flex flex-col gap-1" aria-label="Memuat patch">
                              {[0, 1, 2].map((i) => (
                                <span key={i} className="block h-3 animate-pulse rounded bg-muted" style={{ width: `${90 - i * 15}%` }} />
                              ))}
                            </div>
                          );
                        }
                        if (c.patch != null) return <FileDiff patch={c.patch} serverTruncated={c.truncated} />;
                        return (
                          <p className="font-mono text-[11.5px] text-muted-foreground">
                            {c.error === "file baru"
                              ? "Patch tidak tersedia (file baru)"
                              : "Patch tidak tersedia"}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {files.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllFiles((v) => !v)}
                className="mt-1.5 font-mono text-[10.5px] text-primary hover:underline"
              >
                {showAllFiles ? "Ringkas" : `Lihat semua (${files.length})`}
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Toolbar 1 baris: tabs + count, search kanan ── */}
      <div className="inspector-divider mt-3 flex min-h-[44px] shrink-0 flex-wrap items-center gap-x-3 gap-y-0 border-b border-border bg-card px-5">
        <div role="tablist" aria-label="Filter tipe subagent" className="flex min-w-0 items-stretch self-stretch">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex items-center border-b-2 border-transparent px-2.5 font-sans text-[12.5px] font-medium transition-colors",
                filter === f.value
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="ml-1.5 font-mono text-[10.5px] tabular-nums opacity-70">{f.n}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full items-center py-1.5 sm:w-[240px] sm:flex-none">
          <label className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-muted px-2.5">
            <Search aria-hidden="true" size={13} className="shrink-0 text-muted-foreground" />
            <span className="sr-only">Cari subagent</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari subagent…"
              className="min-w-0 flex-1 bg-transparent font-sans text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
      </div>

      {/* ── Zona scroll: hanya area tabel+detail; topbar/title/breakdown/tabs/footer pinned ── */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      {/* ── Tabel plain 1:1 Mockup A ── */}
      <table className="w-full min-w-0 table-fixed border-collapse">
        <caption className="sr-only">Daftar subagent sesi: tipe, durasi, dan status</caption>
        <colgroup>
          <col />
          <col className="w-[110px]" />
          <col className="w-[84px]" />
          <col className="w-[84px]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="inspector-divider border-b border-border">
            <th scope="col" className="px-5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              subagent
            </th>
            <th scope="col" className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              tipe
            </th>
            <th scope="col" className="px-3 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              durasi
            </th>
            <th scope="col" className="px-5 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              status
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-8 text-center font-sans text-[12.5px] text-muted-foreground">
                {tasks.length === 0 ? "Belum ada riwayat task" : "Tidak ada subagent pada filter ini"}
              </td>
            </tr>
          ) : (
            visible.map((t) => {
              const meta = metaFor(t.agent);
              const id = t.childSessionId ?? `${t.parentSessionId ?? "?"}-${t.startedAt}`;
              const isSel = selected !== null && t === selected;
              return (
                <tr
                  key={id}
                  onClick={() => setSelectedId(id)}
                  className={cn(
                    "inspector-row cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/60",
                    isSel && "bg-primary/15 shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/15",
                  )}
                >
                  <td className="px-5 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden="true" className={cn("mt-1.5 size-[7px] shrink-0 rounded-full", meta.dot)} />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate font-sans text-[13px] font-medium leading-snug text-foreground"
                          title={t.description || t.childSessionId || t.agent}
                        >
                          {taskName(t)}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                          {t.agent}
                          {t.childSessionId
                            ? ` · child ${t.childSessionId.slice(0, 6)}`
                            : t.parentSessionId
                              ? ` · parent ${t.parentSessionId.slice(0, 7)}`
                              : ""}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
                      <span className="truncate">{meta.label}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                    {formatDuration(t.durationMs ?? Math.max(0, now - t.startedAt))}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span className="font-mono text-[11px] text-muted-foreground">{taskStatusLabel(t.status)}</span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* ── Detail baris terpilih: band full-bleed (Mockup A) ── */}
      {selected && selMeta ? (
        <div className="inspector-divider grid grid-cols-1 gap-5 border-t border-border bg-background px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_190px]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", selMeta.dot)} />
              <p className="min-w-0 truncate font-sans text-[13.5px] font-semibold tracking-tight" title={taskName(selected)}>
                {taskName(selected)}
              </p>
            </div>
            <p className="min-w-0 break-words whitespace-pre-wrap pt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {selected.agent} · {desc || "tanpa deskripsi panjang"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Tools subagent">
              {toolBadges.map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
            {errorClean && (
              <p className="pt-2 text-[12px] leading-snug text-destructive" role="alert">
                {errorClean}
              </p>
            )}
          </div>
          <dl className="inspector-metric-grid grid h-fit grid-cols-2 gap-px overflow-hidden rounded-lg" aria-label="Metrik subagent">
            <div className="inspector-metric-cell px-2.5 py-1.5">
              <dt className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground">tokens</dt>
              <dd className="pt-0.5 font-mono text-xs tabular-nums" title={selTokensRaw != null ? selTokensRaw.toLocaleString("id-ID") : undefined}>{selTokens}</dd>
            </div>
            <div className="inspector-metric-cell px-2.5 py-1.5">
              <dt className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground">status</dt>
              <dd className="pt-0.5 font-mono text-xs">{taskStatusLabel(selected.status)}</dd>
            </div>
            <div className="inspector-metric-cell px-2.5 py-1.5">
              <dt className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground">age</dt>
              <dd className="pt-0.5 font-mono text-xs tabular-nums">{selAge}</dd>
            </div>
            <div className="inspector-metric-cell px-2.5 py-1.5">
              <dt className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground">durasi</dt>
              <dd className="pt-0.5 font-mono text-xs tabular-nums">{selDur}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="border-t border-border px-5 py-3.5 text-xs text-muted-foreground">belum ada riwayat task</p>
      )}
      </div>{/* ── /zona scroll ── */}

    </div>
  );
}

export default function Inspector({ item, open, onClose }: InspectorProps) {
  const statusMeta = item ? SESSION_STATUS_META[item.status] : null;
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        data-slot="skan-inspector-modal"
        className="skan-modal inset-x-0 bottom-0 top-auto h-auto max-h-[85vh] overflow-hidden rounded-t-xl border-t border-border bg-background font-sans sm:bottom-auto sm:right-auto sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_24px_64px_rgb(0_0_0/0.5)]"
      >
        {/* Topbar: crumb + id + X */}
        <div className="inspector-divider flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-3">
          <p className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
            sessions / <span className="text-foreground/80">{item?.status ?? "—"}</span>
          </p>
          {item && (
            <p className="hidden shrink-0 truncate font-mono text-[11.5px] text-muted-foreground sm:block">
              {item.id.slice(0, 12)}… · {item.status}
            </p>
          )}
          <DialogPrimitive.Close
            aria-label="Tutup inspector"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={15} />
          </DialogPrimitive.Close>
        </div>

        {/* Title row */}
        <div className="shrink-0 px-5 pt-4">
          <h1 className="font-sans text-[17px] font-semibold leading-snug tracking-tight">{item?.alias ?? "Inspector"}</h1>
          {item && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                {statusMeta && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className={cn("size-1.5 rounded-full", statusMeta.dot, item.status === "thinking" && "lin-pulse")}
                    />
                    {statusMeta.label}
                  </span>
                )}
                {item.status === "failed" && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 font-mono text-[11px] text-red-300"
                    title={
                      item.stuckReason === "part-running"
                        ? `Ada tool running ${formatDuration(item.activeForMs)} (batas ${formatDuration(item.stuckLimitMs)}) — kemungkinan tool menggantung`
                        : item.stuckReason === "turn-orphan"
                          ? `Streaming tanpa tool ${formatDuration(item.activeForMs)} (batas ${formatDuration(item.stuckLimitMs)}) — kemungkinan turn crash tanpa time.completed`
                          : `Aktif ${formatDuration(item.activeForMs)} (batas ${formatDuration(item.stuckLimitMs)})`
                    }
                  >
                    Stuck · {formatDuration(item.activeForMs)} · {item.stuckReason === "part-running" ? "tool" : "turn"}
                  </span>
                )}
                <SessionMetaLine item={item} />
              </div>
              <ModelLine item={item} />
            </>
          )}
        </div>

        <InspectorBody key={item?.id ?? "empty"} item={item} />
      </SheetContent>
    </Sheet>
  );
}
