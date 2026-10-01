"use client";

import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CircleDot, Cog, Compass, Radar, Wrench } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThinkingSpinner } from "@/components/ui/thinking-spinner";
import { StatusBadge } from "./SessionCard";
import { formatAge, formatDuration, formatTokens, type KanbanItem } from "./types";
import type { SubagentTask } from "@/lib/types";
import { cn } from "@/lib/utils";

type InspectorProps = {
  item: KanbanItem | null;
  open: boolean;
  onClose: () => void;
};

type TimelineStep = { key: string; label: string; done: boolean };

const IDLE_THINK_STYLE = `
@keyframes idle-breathe {
  0%, 100% { transform: scale(1); opacity: 0.55; }
  50% { transform: scale(1.5); opacity: 1; }
}
@keyframes idle-orbit-spin {
  to { transform: rotate(360deg); }
}
@keyframes idle-sheen {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes think-slide {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(420%); }
}
@keyframes think-sweep {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.idle-wrap { position: relative; display: inline-flex; width: 8px; height: 8px; flex-shrink: 0; }
.idle-dot {
  width: 8px; height: 8px; border-radius: 9999px;
  background: var(--muted-foreground);
  animation: idle-breathe 2.8s ease-in-out infinite;
}
.idle-wrap.is-stuck .idle-dot { background: var(--destructive); }
.idle-orbit {
  position: absolute; inset: -4px; border-radius: 9999px;
  border: 1px solid transparent; border-top-color: var(--ring);
  animation: idle-orbit-spin 3.2s linear infinite;
}
.idle-sheen {
  background: linear-gradient(100deg, currentColor 40%, var(--ring) 50%, currentColor 60%);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text;
  animation: idle-sheen 3s ease-in-out infinite;
}
.think-text {
  background: linear-gradient(100deg, var(--muted-foreground) 35%, var(--primary) 50%, var(--muted-foreground) 65%);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: think-sweep 2.4s ease-in-out infinite;
}
.think-track {
  display: block; height: 2px; width: 100%; overflow: hidden;
  border-radius: 9999px; background: var(--muted); margin-bottom: 4px;
}
.think-bar {
  display: block; height: 100%; width: 24%;
  border-radius: 9999px; background: var(--primary);
  animation: think-slide 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .idle-dot, .idle-orbit, .idle-sheen, .think-bar, .think-text { animation: none; }
  .idle-sheen, .think-text { background: none; color: inherit; }
}
`;

/** Indikator hidup untuk row idle/error: dot breathed + ring orbit + (sheen di nama). */
function IdleOrbit({ stuck = false }: { stuck?: boolean }) {
  return (
    <span className={cn("idle-wrap", stuck && "is-stuck")} aria-hidden="true">
      <span className="idle-dot" />
      <span className="idle-orbit" />
    </span>
  );
}

type AgentMeta = {
  label: string;
  icon: typeof Cog;
  badge: string;
  iconCls: string;
};

/** Meta tipe REAL dari data tasks (subagent_type) — tanpa tipe fiktif. */
const TYPE_META: Record<string, AgentMeta> = {
  general: {
    label: "General",
    icon: Cog,
    badge: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    iconCls: "text-emerald-500",
  },
  explore: {
    label: "Explore",
    icon: Compass,
    badge: "border-sky-500/40 text-sky-600 dark:text-sky-400",
    iconCls: "text-sky-500",
  },
  explorer: {
    label: "Explorer",
    icon: Radar,
    badge: "border-cyan-500/40 text-cyan-600 dark:text-cyan-400",
    iconCls: "text-cyan-500",
  },
  build: {
    label: "Build",
    icon: Wrench,
    badge: "border-amber-500/40 text-amber-600 dark:text-amber-400",
    iconCls: "text-amber-500",
  },
  unknown: {
    label: "Unknown",
    icon: CircleDot,
    badge: "border-zinc-500/40 text-zinc-600 dark:text-zinc-400",
    iconCls: "text-zinc-500",
  },
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

function taskRowKey(t: SubagentTask, i: number): string {
  return `${t.childSessionId ?? t.parentSessionId ?? t.startedAt}-${t.startedAt}-${i}`;
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

export type DisplaySession = KanbanItem;

export function InspectorPanel({ item }: { item: DisplaySession }) {
  return (
    <section className="skan-panel" data-id={item.id}>
      <div className="flex-row items-center justify-between border-b text-left flex gap-1.5 p-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{item.alias}</span>
          <StatusBadge status={item.status} />
          <span className="truncate font-mono text-[11px] text-muted-foreground">{item.id}</span>
        </div>
      </div>
      <InspectorBody key={item.id} item={item} inline />
    </section>
  );
}

function InspectorBody({ item, inline }: { item: KanbanItem | null; inline?: boolean }) {
  const [filter, setFilter] = useState("semua");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);
  const [reportExpanded, setReportExpanded] = useState(false);
  const [toolTab, setToolTab] = useState<"timeline" | "files">("timeline");
  const [originFilter, setOriginFilter] = useState<"all" | "main" | "sub">("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tasks = useMemo(() => item?.tasks ?? [], [item]);
  const toolHistory = useMemo(() => item?.toolHistory ?? [], [item]);
  const changedFiles = useMemo(() => item?.changedFiles ?? [], [item]);

  const toolFiltered = useMemo(() => {
    const f = originFilter === "all" ? toolHistory : toolHistory.filter((t) => t.origin === originFilter);
    return f.slice(0, 100);
  }, [toolHistory, originFilter]);

  const fileStats = useMemo(() => {
    let a = 0;
    let d = 0;
    for (const f of changedFiles) {
      if (f.source === "patch-list") continue;
      a += f.added;
      d += f.deleted;
    }
    return { n: changedFiles.length, a, d };
  }, [changedFiles]);

  const distinctAgents = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) s.add(normAgent(t.agent));
    return [...s].sort();
  }, [tasks]);

  const filters = useMemo(
    () => [{ value: "semua", label: "Semua" }, ...distinctAgents.map((a) => ({ value: a, label: agentLabel(a) }))],
    [distinctAgents],
  );

  const filtered = useMemo(() => {
    if (filter === "semua") return tasks;
    return tasks.filter((t) => normAgent(t.agent) === filter);
  }, [tasks, filter]);

  const selected: SubagentTask | null = useMemo(() => {
    if (selectedId) {
      const found = tasks.find((t, i) => taskRowKey(t, i) === selectedId);
      if (found) return found;
      const byChild = tasks.find((t) => t.childSessionId === selectedId);
      if (byChild) return byChild;
    }
    return filtered[0] ?? tasks[0] ?? null;
  }, [tasks, filtered, selectedId]);

  const liveCount = useMemo(() => tasks.filter((t) => t.status === "running").length, [tasks]);

  const distinctTools = useMemo(() => {
    const s = new Set<string>();
    for (const c of item?.activeChildren ?? []) {
      if (c.tool) s.add(c.tool);
    }
    return [...s].sort();
  }, [item]);

  const breakdown = item?.breakdown ?? ([0, 0, 0] as [number, number, number]);
  const breakdownTotal = breakdown[0] + breakdown[1] + breakdown[2];
  const breakdownNorm: [number, number, number] =
    breakdownTotal > 0
      ? (breakdown.map((v) => (v / breakdownTotal) * 100) as [number, number, number])
      : ([0, 0, 0] as [number, number, number]);
  const breakdownSegs = [
    { label: "aktif", value: breakdown[0], width: breakdownNorm[0], segCls: "bg-primary", legendCls: "text-primary" },
    { label: "tool", value: breakdown[1], width: breakdownNorm[1], segCls: "bg-ring", legendCls: "text-ring" },
    { label: "idle", value: breakdown[2], width: breakdownNorm[2], segCls: "bg-muted-foreground", legendCls: "text-muted-foreground" },
  ] as const;
  const breakdownRows = [
    { label: "aktif", value: breakdown[0], color: "var(--primary)" },
    { label: "tool", value: breakdown[1], color: "var(--ring)" },
    { label: "idle", value: breakdown[2], color: "var(--muted-foreground)" },
  ] as const;

  const matchedActive = selected
    ? (item?.activeChildren.find((c) => Boolean(selected.childSessionId) && (c.sessionId === selected.childSessionId)) ?? null)
    : null;

  const copyLog = async () => {
    if (!selected) return;
    const clean = cleanReport(selected.report ?? selected.description ?? "");
    try {
      await navigator.clipboard.writeText(clean);
      setCopiedLog(true);
      setTimeout(() => setCopiedLog(false), 1200);
    } catch {
      setCopiedLog(false);
    }
  };

  if (!item) {
    return (
      <div className="space-y-4 p-4">
        <style>{IDLE_THINK_STYLE}</style>
        <div className="rounded-2xl border border-dashed p-5 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="text-2xl">◉</p>
          <p className="mt-1 text-xs font-bold">Belum ada seleksi</p>
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            Klik kartu untuk melihat detail live.
          </p>
        </div>
      </div>
    );
  }

  const selMeta = selected ? metaFor(selected.agent) : null;
  const SelIcon = selMeta?.icon ?? CircleDot;

  const selAge = selected ? formatAge(Math.max(0, now - selected.startedAt)) : "—";
  const selDur = selected ? formatDuration(selected.durationMs ?? Math.max(0, now - selected.startedAt)) : "—";
  const selTokens =
    selected?.tokens != null
      ? formatTokens(selected.tokens)
      : matchedActive
        ? formatTokens(matchedActive.tokens)
        : "—";
  const selTools: string[] = selected?.tools ?? [];
  const toolBase =
    matchedActive?.tool ??
    (selTools.length > 0
      ? selTools.slice(0, 3).join(", ")
      : distinctTools.length > 0
        ? distinctTools.slice(0, 3).join(", ")
        : "task");
  const toolState = !selected ? "—" : selected.status === "running" ? "berjalan" : selected.status === "error" ? "error" : "selesai";
  const parentShort = selected?.parentSessionId?.slice(0, 8) ?? item.id.slice(0, 8);
  const spawnLabel = selected ? `spawn dari ${item.alias || parentShort} · ${selAge} lalu` : "—";
  const toolLabel = selected ? `tool ${toolBase} · ${toolState}` : "—";
  const desc = selected?.description.trim() ?? "";
  const descClean = desc ? cleanReport(desc) : "";
  const reportRaw = selected?.report ?? null;
  const reportCleanFull = reportRaw ? cleanReport(reportRaw) : "";
  const reportLen = reportCleanFull.length;
  const reportPreview = reportCleanFull
    ? `${reportCleanFull.slice(0, 300)}${reportLen > 300 ? "…" : ""} (${reportLen} char)${selected?.truncated ? " · truncated" : ""}`
    : "";
  const reportFull = reportCleanFull
    ? `${reportCleanFull} (${reportLen} char)${selected?.truncated ? " · truncated" : ""}`
    : "";
  const errorText = selected?.errorText ?? null;
  const errorClean = errorText ? cleanReport(errorText) : "";
  const reportLabel = !selected
    ? "—"
    : selected.status === "running"
      ? "menunggu output"
      : ((reportExpanded ? reportFull : reportPreview) || descClean || "tanpa deskripsi");
  const timeline: TimelineStep[] = selected
    ? [
        { key: "spawn", label: spawnLabel, done: true },
        { key: "tool", label: toolLabel, done: true },
        { key: "report", label: reportLabel, done: selected.status !== "running" },
      ]
    : [];
  const toolBadges =
    selTools.length > 0
      ? selTools.slice(0, 6)
      : distinctTools.length > 0
        ? distinctTools.slice(0, 6)
        : ["task"];

  return (
    <div>
      <style>{IDLE_THINK_STYLE}</style>
      {/* ── Strip breakdown 3-segmen (derived dari item.breakdown) ── */}
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">breakdown</p>
        <div
          className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Breakdown sesi: aktif ${breakdown[0]} persen, tool ${breakdown[1]} persen, idle ${breakdown[2]} persen`}
        >
          {breakdownSegs.map((s) => (
            <span
              key={s.label}
              className={`block h-full shrink-0 rounded-none ${s.segCls}`}
              style={{
                width: `${s.width}%`,
                ...( ((s.value > 0) && (s.width < 8)) ? { minWidth: "8%" } : {}),
              }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold tabular-nums">
          {breakdownSegs.map((r) => (
            <span key={r.label} className={r.legendCls}>
              ● {r.label} {r.value}%
            </span>
          ))}
        </div>
        <table className="sr-only">
          <caption>Breakdown aktivitas sesi dalam persen</caption>
          <tbody>
            {breakdownRows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.value}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Split: tabel kiri, detail kanan ── */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Kiri */}
        <div className="min-w-0 space-y-3 p-4">
          <div className="flex items-center gap-1.5">
            <Button
              variant={toolTab === "timeline" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setToolTab("timeline")}
            >
              Timeline
            </Button>
            <Button
              variant={toolTab === "files" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setToolTab("files")}
            >
              Changed Files
            </Button>
            {toolTab === "timeline" && (
              <span className="ml-auto flex gap-1">
                {(["all", "main", "sub"] as const).map((o) => (
                  <Button
                    key={o}
                    variant={originFilter === o ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => setOriginFilter(o)}
                  >
                    {o === "all" ? "Semua" : o === "main" ? "Main" : "Sub"}
                  </Button>
                ))}
              </span>
            )}
          </div>
          {toolTab === "timeline" ? (
            <div className="max-h-[180px] space-y-1 overflow-y-auto" role="region" aria-label="Timeline tool">
              {toolFiltered.length === 0 && (
                <p className="py-3 text-center text-xs text-muted-foreground">belum ada tool</p>
              )}
              {toolFiltered.map((t, i) => (
                <div key={`${t.at}-${t.tool}-${i}`} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                  <span className="shrink-0 font-mono font-bold">{t.tool}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {t.origin}
                  </Badge>
                  <span className="shrink-0 font-mono text-muted-foreground">{t.status}</span>
                  <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                    {formatAge(Math.max(0, now - t.at))}
                  </span>
                  {t.filePath && (
                    <span className="min-w-0 flex-1 truncate font-mono opacity-70" title={t.filePath}>
                      {t.filePath}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1" role="region" aria-label="Changed files">
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {fileStats.n} file +{fileStats.a} -{fileStats.d}
              </p>
              <div className="max-h-[180px] space-y-1 overflow-y-auto">
                {changedFiles.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">belum ada file</p>
                )}
                {changedFiles.map((f) => (
                  <div key={f.file} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                    <span className="min-w-0 flex-1 truncate font-mono font-semibold" title={f.file}>
                      {f.file.split("/").pop() ?? f.file}
                    </span>
                    {f.source === "patch-list" ? (
                      <span className="shrink-0 font-mono text-muted-foreground">list</span>
                    ) : (
                      <span className="shrink-0 font-mono tabular-nums">
                        +{f.added} -{f.deleted}
                      </span>
                    )}
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {f.source}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Tabs value={filter} onValueChange={setFilter} className="w-full">
            <TabsList aria-label="Filter tipe subagent" className="flex-wrap rounded-md">
              {filters.map((f) => (
                <TabsTrigger key={f.value} value={f.value}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div
            aria-label="Legenda tipe subagent"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
          >
            {distinctAgents.length === 0 && <span className="font-semibold">belum ada tipe</span>}
            {distinctAgents.map((k) => {
              const m = metaFor(k);
              const LIcon = m.icon;
              return (
                <span key={k} className="inline-flex items-center gap-1">
                  <LIcon aria-hidden="true" size={13} className={m.iconCls} />
                  <span className="font-semibold">{m.label}</span>
                </span>
              );
            })}
          </div>
          <div
            className="max-h-[380px] overflow-y-auto"
            role="region"
            aria-label="Tabel subagent"
            tabIndex={0}
          >
            <Table aria-label={`Daftar subagent ${item.alias}`}>
              <TableCaption>
                Daftar subagent {item.alias} · {tasks.length} baris
              </TableCaption>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead scope="col" className="whitespace-nowrap px-2">Subagent</TableHead>
                  <TableHead scope="col" className="whitespace-nowrap px-2">Tipe</TableHead>
                  <TableHead scope="col" className="whitespace-nowrap px-2 text-right">
                    Durasi
                  </TableHead>
                  <TableHead scope="col" className="whitespace-nowrap px-2 text-right">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t, i) => {
                  const meta = metaFor(t.agent);
                  const Icon = meta.icon;
                  const key = taskRowKey(t, i);
                  const isSelected = selected ? (selected === t || ((selected.childSessionId === t.childSessionId) && (selected.startedAt === t.startedAt))) : false;
                  const isRunning = t.status === "running";
                  const isError = t.status === "error";
                  const dur = formatDuration(t.durationMs ?? Math.max(0, now - t.startedAt));
                  return (
                    <TableRow
                      key={key}
                      onClick={() => setSelectedId(key)}
                      aria-selected={isSelected}
                      className={cn("cursor-pointer", isRunning && "bg-primary/5", isSelected && "bg-accent/10")}
                    >
                      <TableCell className="px-2">
                        {isRunning && (
                          <span className="think-track" aria-hidden="true">
                            <span className="think-bar" />
                          </span>
                        )}
                        <span className="flex min-w-0 items-start gap-1.5">
                          <Icon size={15} aria-hidden="true" className={cn("mt-0.5 shrink-0", meta.iconCls)} />
                          <span
                            className={cn(
                              "line-clamp-2 min-w-0 flex-1 break-words whitespace-normal font-mono text-xs font-semibold",
                              !isRunning && "idle-sheen",
                            )}
                            title={t.description || t.childSessionId || t.agent}
                          >
                            {taskName(t)}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="px-2">
                        <Badge variant="outline" className={cn("text-[10px]", meta.badge)}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 text-right font-mono text-[11px] tabular-nums">{dur}</TableCell>
                      <TableCell className="px-2 text-right">
                        {isRunning ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <ThinkingSpinner size={12} />
                            <span className="sr-only">live, thinking</span>
                            <span aria-hidden="true" className="think-text font-mono text-[10px] font-semibold">
                              thinking…
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                isError ? "bg-destructive" : "bg-muted-foreground",
                              )}
                            />
                            <span className="sr-only">{isError ? "error" : "done"}</span>
                            <span aria-hidden="true" className="font-mono text-[10px] text-muted-foreground">
                              {isError ? "error" : "done"}
                            </span>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                      {tasks.length === 0 ? "belum ada riwayat task" : "Tidak ada subagent pada filter ini."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator className="md:hidden" />

        {/* Kanan: detail */}
        <div className="min-w-0 border-border p-4 md:border-l">
          {selected && selMeta ? (
            <Card className="rounded-2xl border-0 bg-transparent shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={cn(selMeta.iconCls)}>
                    <SelIcon size={22} />
                  </span>
                  <Badge variant="outline" className={cn("text-[10px]", selMeta.badge)}>
                    {selMeta.label}
                  </Badge>
                  {selected.status === "running" ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold">
                      <ThinkingSpinner size={12} />
                      <span className="think-text" aria-hidden="true">
                        thinking…
                      </span>
                      <span className="sr-only">live, thinking</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          selected.status === "error" ? "bg-destructive" : "bg-muted-foreground",
                        )}
                      />
                      <IdleOrbit stuck={selected.status === "error"} />
                      <span aria-hidden="true">{selected.status === "error" ? "error" : "done"}</span>
                      <span className="sr-only">{selected.status === "error" ? "error" : "done"}</span>
                    </span>
                  )}
                </div>
                <CardTitle className="font-heading pt-1 text-xl font-extrabold">{taskName(selected)}</CardTitle>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {selected.childSessionId ?? selected.parentSessionId ?? "—"}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {selected.agent} · {desc || "tanpa deskripsi"}
                </p>
                <div className="flex flex-wrap gap-1.5" aria-label="Tools subagent">
                  {toolBadges.map((t) => (
                    <Badge key={t} variant="secondary" className="font-mono text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
                <dl className="grid grid-cols-2 gap-2" aria-label="Metrik subagent">
                  <div className="rounded-md border border-border p-2">
                    <dt className="text-[10px] text-muted-foreground">tokens</dt>
                    <dd className="font-mono text-xs font-bold tabular-nums">{selTokens}</dd>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <dt className="text-[10px] text-muted-foreground">age</dt>
                    <dd className="font-mono text-xs font-bold tabular-nums">{selAge}</dd>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <dt className="text-[10px] text-muted-foreground">durasi</dt>
                    <dd className="font-mono text-xs font-bold tabular-nums">{selDur}</dd>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <dt className="text-[10px] text-muted-foreground">status</dt>
                    <dd className="font-mono text-xs font-bold">{selected.status}</dd>
                  </div>
                </dl>
                <Separator />
                <ol className="space-y-2" aria-label="Timeline mini subagent">
                  {timeline.map((t) => (
                    <li key={t.key} className="flex gap-2 text-xs">
                      <span
                        aria-hidden="true"
                        className="mt-1 size-2 shrink-0 rounded-full"
                        style={{ background: t.done ? "var(--primary)" : "var(--muted-foreground)" }}
                      />
                      <span className="min-w-0 flex-1">
                        <b>{t.key}</b> —{" "}
                        {t.key === "report" ? (
                          <>
                            <span
                              className={cn(
                                "text-muted-foreground break-words",
                                !reportExpanded ? "line-clamp-4" : "max-h-48 overflow-y-auto whitespace-pre-wrap",
                              )}
                            >
                              {t.label}
                            </span>
                            {reportLen > 300 && (
                              <button
                                type="button"
                                onClick={() => setReportExpanded((v) => !v)}
                                className="mt-1 text-[11px] font-semibold text-primary hover:underline"
                              >
                                {reportExpanded ? "Tutup" : "Selengkapnya"}
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">{t.label}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
                {errorClean && (
                  <p className="text-xs leading-relaxed text-destructive" role="alert">
                    {errorClean}
                  </p>
                )}
                <Button variant="ghost" size="sm" className="w-full" onClick={copyLog}>
                  {copiedLog ? "copied ✓" : "Salin laporan"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <p className="text-[11px] opacity-60">belum ada riwayat task</p>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex flex-row items-center justify-between border-t border-border p-4">
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground" role="status">
          {tasks.length} subagent • {liveCount} live · {toolHistory.length} tool · {changedFiles.length} file
        </p>
        {!inline && (
          <DialogPrimitive.Close asChild>
            <Button variant="outline" size="sm">
              Tutup
            </Button>
          </DialogPrimitive.Close>
        )}
      </div>
    </div>
  );
}

export default function Inspector({ item, open, onClose }: InspectorProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        data-slot="skan-inspector-modal"
        className="skan-modal inset-x-0 bottom-0 top-auto h-auto max-h-[85vh] overflow-y-auto rounded-t-2xl border-t sm:bottom-auto sm:right-auto sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="flex-row items-center justify-between border-b text-left flex gap-1.5 p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{item?.alias ?? "Inspector"}</span>
            {item && <StatusBadge status={item.status} />}
            {item && <span className="truncate font-mono text-[11px] text-muted-foreground">{item.id}</span>}
          </div>
          <DialogPrimitive.Close
            aria-label="Tutup inspector"
            className="rounded-lg border px-2 py-1 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            Tutup ✕
          </DialogPrimitive.Close>
        </div>
        <InspectorBody key={item?.id ?? "empty"} item={item} />
      </SheetContent>
    </Sheet>
  );
}
