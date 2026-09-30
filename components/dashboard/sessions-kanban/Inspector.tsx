"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import LatticeLoader from "@/components/micro/LatticeLoader";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "./SessionCard";
import { formatAge, formatDuration, type KanbanItem } from "./types";

type InspectorProps = {
  item: KanbanItem | null;
  open: boolean;
  onClose: () => void;
};

type TimelineStep = { key: string; label: string; done: boolean };

/** Timeline live dari ageMs + status (port struktur mock 257-263). */
function buildTimeline(item: KanbanItem): TimelineStep[] {
  const created: TimelineStep = {
    key: "created",
    label: `sesi dibuat · ${item.ageLabel} lalu`,
    done: true,
  };
  const tool = item.activeChildren[0]?.tool ?? "—";
  if (item.status === "thinking")
    return [
      created,
      { key: "thinking", label: `agent aktif · tool ${tool}`, done: true },
      { key: "review", label: "menunggu giliran", done: false },
    ];
  if (item.status === "failed")
    return [
      created,
      { key: "progress", label: "pengerjaan parsial", done: true },
      { key: "failed", label: "error · perlu retry", done: true },
    ];
  if (item.status === "queued")
    return [
      created,
      { key: "queued", label: "antre · menunggu slot", done: true },
      { key: "thinking", label: "belum mulai", done: false },
    ];
  return [
    created,
    { key: "progress", label: "dikerjakan", done: true },
    { key: "done", label: "selesai · idle", done: true },
  ];
}

function InspectorBody({ item }: { item: KanbanItem | null }) {
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const first = item?.activeChildren[0] ?? null;
  const timeline = item ? buildTimeline(item) : [];
  // Riwayat task: `tasks` sudah memuat running juga → blok "riwayat" filter
  // status !== "running" supaya tidak duplikat dengan blok live.
  const runningTasks = item?.tasks.filter((t) => t.status === "running") ?? [];
  // ponytail: cap 30 agar Sheet tidak melebar; naikkan + virtualisasi saat >200 task/sesi.
  const doneTasks = (item?.tasks.filter((t) => t.status !== "running") ?? []).slice(0, 30);

  return (
    <div className="space-y-4 p-4">
      {!item && (
        <div
          className="rounded-2xl border border-dashed p-5 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-2xl">◉</p>
          <p className="mt-1 text-xs font-bold">Belum ada seleksi</p>
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            Klik kartu untuk melihat detail live.
          </p>
        </div>
      )}
      {item && (
        <>
          <div
            className="rounded-2xl p-4"
            style={{
              background:
                "linear-gradient(120deg, var(--primary), color-mix(in srgb, var(--primary) 55%, var(--accent)))",
              color: "var(--primary-foreground)",
            }}
          >
            <div className="flex items-center gap-2">
              <StatusBadge status={item.status} />
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: "color-mix(in srgb, var(--foreground) 18%, transparent)" }}
              >
                ⌁ {item.agent}
              </span>
            </div>
            {item.status === "thinking" && (
              <div className="mt-2">
                <LatticeLoader
                  label="Thinking"
                  status="working"
                  elapsed={item.ageMs / 1000}
                  cellSize={5}
                  fontSize={12}
                />
              </div>
            )}
            <h3 className="font-heading mt-2 text-lg font-extrabold">{item.alias}</h3>
            <p className="mono mt-0.5 flex items-center gap-1.5 text-[11px] opacity-90">
              {item.id}
              <button
                onClick={copyId}
                className="rounded px-1.5 py-0.5 text-[10px] font-bold hover:opacity-80"
                style={{ background: "color-mix(in srgb, var(--foreground) 18%, transparent)" }}
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            </p>
            <p className="mono mt-1 truncate text-xs opacity-90">{item.title}</p>
          </div>

          <div className="skan-panel p-3.5">
            <p
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              activeChildren{item.activeChildren.length > 1 ? ` (${item.activeChildren.length})` : ""}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl p-2" style={{ border: "1px solid var(--border)" }}>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>tool</p>
                <b className="mono">{first?.tool ?? "—"}</b>
              </div>
              <div className="rounded-xl p-2" style={{ border: "1px solid var(--border)" }}>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>partType</p>
                <b className="mono">{first?.partType ?? "—"}</b>
              </div>
              <div className="rounded-xl p-2" style={{ border: "1px solid var(--border)" }}>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>tokens</p>
                <b className="mono">{item.tokensLabel}</b>
              </div>
              <div className="rounded-xl p-2" style={{ border: "1px solid var(--border)" }}>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>age</p>
                <b className="mono">{item.ageLabel} lalu</b>
              </div>
            </div>
            <p className="mono mt-2 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              {item.dir}
            </p>
          </div>

          <div className="skan-panel p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                subagent
              </p>
              {runningTasks.length > 0 && (
                <Badge variant="secondary">
                  {runningTasks.length} aktif
                </Badge>
              )}
            </div>
            {item.activeChildren.length > 0 ? (
              <ScrollArea className="mt-2 max-h-40">
                <ul className="space-y-1.5 pr-3">
                  {item.activeChildren.map((c) => (
                    <li key={c.sessionId} className="flex items-center gap-2">
                      <Badge variant="default" className="min-w-0 shrink">
                        <span className="truncate">
                          {c.agent} · {c.title}
                        </span>
                      </Badge>
                      <span className="mono text-[10px] opacity-60">
                        {c.tool} · {formatAge(c.ageMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : (
              <p className="mt-2 text-[11px] opacity-60">tidak ada proses aktif</p>
            )}
            <Separator className="my-3" />
            {doneTasks.length > 0 ? (
              <ul className="space-y-1.5">
                {doneTasks.map((t, i) => (
                  <li key={`${t.childSessionId ?? t.startedAt}-${i}`} className="flex items-center gap-2">
                    <Badge variant={t.status === "error" ? "destructive" : "outline"}>
                      {t.agent}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-[11px]">{t.description}</span>
                    <span className="mono text-[10px] opacity-60">{formatDuration(t.durationMs)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] opacity-60">belum ada riwayat task</p>
            )}
          </div>

          <div className="skan-panel p-3.5">
            <p
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              breakdown
            </p>
            <div className="breakbar mt-2" aria-hidden="true">
              <span style={{ width: `${item.breakdown[0]}%` }} />
              <span style={{ width: `${item.breakdown[1]}%` }} />
              <span style={{ width: `${item.breakdown[2]}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] font-bold">
              <span style={{ color: "var(--primary)" }}>● aktif {item.breakdown[0]}%</span>
              <span style={{ color: "var(--ring)" }}>● tool {item.breakdown[1]}%</span>
              <span style={{ color: "var(--muted-foreground)" }}>● idle {item.breakdown[2]}%</span>
            </div>
          </div>

          <div className="skan-panel p-3.5">
            <p
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              timeline
            </p>
            <ol className="mt-2 space-y-2 text-xs">
              {timeline.map((t) => (
                <li key={t.key} className="flex gap-2">
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full"
                    style={{ background: t.done ? "var(--primary)" : "var(--muted-foreground)" }}
                  />
                  <span>
                    <b>{t.key}</b> — {t.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
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
        className="skan-modal inset-x-0 bottom-0 top-auto h-auto max-h-[85vh] overflow-y-auto rounded-t-2xl border-t sm:bottom-auto sm:right-auto sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <SheetHeader className="flex-row items-center justify-between border-b text-left" style={{ borderColor: "var(--border)" }}>
          <SheetTitle>Inspector</SheetTitle>
          <DialogPrimitive.Close
            aria-label="Tutup inspector"
            className="rounded-lg border px-2 py-1 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            ✕
          </DialogPrimitive.Close>
        </SheetHeader>
        <InspectorBody item={item} />
      </SheetContent>
    </Sheet>
  );
}
