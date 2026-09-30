"use client";

import { useCallback, useEffect, useState } from "react";
import LatticeLoader from "@/components/micro/LatticeLoader";
import { StatusBadge } from "./SessionCard";
import type { KanbanItem } from "./types";

type InspectorProps = {
  item: KanbanItem | null;
  open?: boolean;
  onClose?: () => void;
  showFab?: boolean;
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

export default function Inspector({ item, open: controlledOpen, onClose, showFab = true }: InspectorProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : innerOpen;
  const close = useCallback(() => {
    if (controlled) onClose?.();
    else setInnerOpen(false);
  }, [controlled, onClose]);

  // Klik kartu → buka drawer di <lg (mode uncontrolled).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron buka drawer saat item berubah disengaja, guard item+uncontrolled
    if (item && !controlled) setInnerOpen(true);
  }, [item?.id, controlled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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

  return (
    <>
      <aside
        className={`skan-inspector h-screen w-full shrink-0 flex-col overflow-y-auto border-l sm:w-80 lg:flex${open ? " open" : ""}`}
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div
          className="sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 backdrop-blur"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <b className="text-sm">Inspector</b>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: "var(--muted)", color: "var(--foreground)" }}
          >
            persistent
          </span>
          <button
            onClick={close}
            className="ml-auto rounded-lg border px-2 py-1 text-xs lg:hidden"
            style={{ borderColor: "var(--border)" }}
            aria-label="Tutup inspector"
          >
            ✕
          </button>
        </div>
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
                    style={{ background: "rgb(0 0 0 / 0.18)" }}
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
                    style={{ background: "rgb(0 0 0 / 0.18)" }}
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
              {/* Tanpa Resume/Fork — disembunyikan sesuai keputusan. */}
            </>
          )}
        </div>
      </aside>
      {showFab && (
        <button
          onClick={() => setInnerOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 rounded-full px-4 py-2.5 text-sm font-bold shadow-lg lg:hidden"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        ◉ Inspector
      </button>
      )}
    </>
  );
}
