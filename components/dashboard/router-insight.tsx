"use client";

import * as React from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_INSIGHT_SECTIONS,
  INSIGHT_SECTIONS,
  MAX_USER_PROMPT_CHARS,
  type InsightSection,
} from "@/lib/router-insight";
import type { RouterStats } from "@/lib/types";
import { fmt2, fullNum } from "@/lib/utils";

export type RouterInsightProps = {
  /** null = DB 9router gagal -> strip bukti disembunyi (fail-open). */
  stats?: RouterStats | null;
};

type InsightState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "done";
      insight: string;
      source: "llm" | "fallback";
      error: string | null;
      code: string | null;
      model: string | null;
      tried: string[] | null;
      sources: { opencode: boolean } | null;
    };

type InsightHistoryEntry = {
  at: number;
  insight: string;
  source: "llm" | "fallback";
  model: string | null;
  error: string | null;
  prompt: string;
  sections: InsightSection[];
};

const HISTORY_KEY = "router-insight-history";
const HISTORY_CAP = 20;

function loadHistory(): InsightHistoryEntry[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((e): e is InsightHistoryEntry => typeof e === "object" && e !== null && typeof (e as InsightHistoryEntry).insight === "string").slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

// Kontrak prompt (lib/router-insight.ts): 1 paragraf pembuka + maks 3 bullet
// "- ". Pisah agar lead tampil 13px muted, list pakai dot 4px Linear.
function splitInsight(text: string): { lead: string; bullets: string[] } {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const leadParts: string[] = [];
  const bullets: string[] = [];
  for (const line of lines) {
    const m = line.match(/^[-•*]\s+(.*)$/);
    if (m) bullets.push(m[1]);
    else if (bullets.length === 0) leadParts.push(line);
    else bullets.push(line);
  }
  return { lead: leadParts.join(" "), bullets: bullets.slice(0, 4) };
}
// Kartu Insight naratif opencode + 9router. Trigger manual via tombol
// (sesuai keputusan: klik baru generate, bukan auto) supaya tidak membakar
// request LLM tiap poll 60s. Gagal LLM -> tampilkan fallback template angka +
// pesan error jujur.
export function RouterInsight({ stats = null }: RouterInsightProps) {
  const [state, setState] = React.useState<InsightState>({ status: "idle" });
  // Insight advance: prompt kustom (opsional) + checklist data per-bagian.
  // Tanpa history — cukup state sesi ini. Default semua tercentang.
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");
  const [sections, setSections] = React.useState<InsightSection[]>(DEFAULT_INSIGHT_SECTIONS);
  const [history, setHistory] = React.useState<InsightHistoryEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = React.useState(false);

  const pushHistory = React.useCallback((entry: InsightHistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_CAP);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleSection = React.useCallback((key: InsightSection, checked: boolean) => {
    setSections((prev) =>
      checked ? [...prev, key].filter((v, i, a) => a.indexOf(v) === i) : prev.filter((v) => v !== key),
    );
  }, []);

  const generate = React.useCallback(async () => {
    if (sections.length === 0) {
      setState({
        status: "done",
        insight: "",
        source: "fallback",
        error: "Pilih minimal 1 bagian data dulu.",
        code: "NO_SECTIONS",
        model: null,
        tried: null,
        sources: null,
      });
      return;
    }
    setState({ status: "loading" });
    const ctrl = new AbortController();
    // Rantai bisa mencoba 9 model @60s — beri 300s agar sukses lambat
    // (mis. antrean queued) tetap sampai ke klien.
    const to = setTimeout(() => ctrl.abort(), 300_000);
    try {
      const res = await fetch("/api/router/insight", {
        method: "POST",
        cache: "no-store",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: 30,
          sections,
          prompt: prompt.trim() === "" ? undefined : prompt.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const doneState = {
        status: "done" as const,
        insight: String(json.insight ?? ""),
        source: (json.source === "llm" ? "llm" : "fallback") as "llm" | "fallback",
        error: typeof json.error === "string" ? json.error : null,
        code: typeof json.code === "string" ? json.code : null,
        model: typeof json.model === "string" ? json.model : null,
        tried: Array.isArray(json.tried)
          ? json.tried.filter((t: unknown): t is string => typeof t === "string")
          : null,
        sources:
          typeof json.sources === "object" && json.sources !== null
            ? {
                opencode: (json.sources as Record<string, unknown>).opencode === true,
              }
            : null,
      };
      setState(doneState);
      if (doneState.insight) {
        pushHistory({
          at: Date.now(),
          insight: doneState.insight,
          source: doneState.source,
          model: doneState.model,
          error: doneState.error,
          prompt: prompt.trim().slice(0, 200),
          sections: [...sections],
        });
      }
    } catch (e) {
      setState({
        status: "done",
        insight: "",
        source: "fallback",
        error: e instanceof Error ? e.message : "generate gagal",
        code: "CLIENT_ERROR",
        model: null,
        tried: null,
        sources: null,
      });
    } finally {
      clearTimeout(to);
    }
  }, [prompt, sections, pushHistory]);

  const loading = state.status === "loading";
  const groups = React.useMemo(
    () => (["9router", "Opencode"] as const).map((g) => ({ name: g, items: INSIGHT_SECTIONS.filter((s) => s.group === g) })),
    [],
  );

  const copyDiagnostics = React.useCallback(() => {
    if (state.status !== "done") return;
    const payload = JSON.stringify(
      {
        source: state.source,
        code: state.code,
        model: state.model,
        tried: state.tried,
        error: state.error,
        insightLength: state.insight.length,
      },
      null,
      2,
    );
    void navigator.clipboard?.writeText(payload).catch(() => {});
  }, [state]);

  const done = state.status === "done";
  const modelLabel =
    done && typeof state.model === "string" && state.model.trim() !== ""
      ? state.model.split("/").pop() ?? state.model
      : null;

  return (
    <Card className="overflow-hidden rounded-lg border-border bg-card shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Insight
          {done && (
            <>
              <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                {state.source === "llm" ? "AI" : "angka"}
              </Badge>
              {modelLabel && (
                <span
                  className="max-w-[180px] truncate rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground"
                  title={state.model ?? undefined}
                >
                  {modelLabel}
                </span>
              )}
            </>
          )}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={generate}
          disabled={loading || sections.length === 0}
          title={sections.length === 0 ? "Pilih minimal 1 bagian data dulu" : undefined}
          aria-busy={loading}
          className="min-h-9 shrink-0 cursor-pointer transition-colors duration-150"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {loading ? "Menulis…" : state.status === "idle" ? "Generate" : "Generate ulang"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {stats && (
          <dl
            aria-label="Bukti angka 9router"
            className="grid grid-cols-3 gap-2 rounded-md border border-border/60 bg-muted/40 p-2.5"
          >
            <div className="min-w-0">
              <dt className="truncate text-[11px] text-muted-foreground">Biaya {stats.dayCount}h</dt>
              <dd
                className="truncate text-sm font-semibold tabular-nums text-foreground"
                title={`$${fmt2(stats.cost)}`}
              >
                ${fmt2(stats.cost)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-[11px] text-muted-foreground">Token</dt>
              <dd
                className="truncate text-sm font-semibold tabular-nums text-foreground"
                title={`${stats.totalTokens}`}
              >
                {fullNum(stats.totalTokens)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-[11px] text-muted-foreground">Cache-hit</dt>
              <dd
                className="truncate text-sm font-semibold tabular-nums text-foreground"
                title={`${fmt2(stats.cacheHit)}% (${fullNum(stats.cachedTokens)} dari ${fullNum(stats.promptTokens)} prompt)`}
              >
                {fmt2(stats.cacheHit)}%
              </dd>
            </div>
          </dl>
        )}
        {state.status === "idle" && (
          <div className="rounded-md border border-dashed border-border p-3">
            <p className="text-sm text-muted-foreground">
              Ringkasan naratif opencode + 9router (30 hari) — klik Generate untuk menulis.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Angka di atas selalu dari data asli; narasi AI tidak boleh mengarang angka.
            </p>
          </div>
        )}
        {loading && (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="flex flex-col gap-2"
          >
            <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-full motion-reduce:animate-none" />
            <Skeleton className="h-4 w-5/6 motion-reduce:animate-none" />
            <span className="sr-only">Menulis ringkasan dari data opencode + 9router…</span>
          </div>
        )}
        {done && (
          <div className="flex flex-col gap-2.5">
            {state.error && (
              <div
                role="alert"
                className="rounded-md border border-amber-600/30 border-l-4 border-l-amber-500 bg-amber-600/[0.06] px-3 py-2 dark:border-amber-400/30 dark:border-l-amber-400 dark:bg-amber-400/[0.04]"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-xs text-amber-700 dark:text-amber-300">{state.error}</p>
                  {state.code && (
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground">
                      {state.code}
                    </span>
                  )}
                </div>
              </div>
            )}
            {state.insight ? (
              (() => {
                const { lead, bullets } = splitInsight(state.insight);
                return (
                  <div className="flex flex-col gap-2.5">
                    {lead && (
                      <p className="max-w-[75ch] text-[15px] leading-relaxed text-foreground">{lead}</p>
                    )}
                    {bullets.length > 0 && (
                      <ol className="flex flex-col gap-2 border-t border-border/60 pt-2.5">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                            <span
                              aria-hidden
                              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary"
                            >
                              {i + 1}
                            </span>
                            <span className="min-w-0">{b}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                );
              })()
            ) : (
              !state.error && (
                <p className="text-sm text-muted-foreground">Respons kosong — coba generate ulang.</p>
              )
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {stats ? `s/d ${stats.lastDate} · ${stats.dayCount} hari` : "30 hari"}
                {modelLabel ? ` · ${modelLabel}` : ""}
              </p>
              <button
                type="button"
                onClick={copyDiagnostics}
                className="cursor-pointer rounded-sm text-[11px] text-muted-foreground underline underline-offset-2 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
              >
                salin diagnostik
              </button>
            </div>
          </div>
        )}
        {history.length > 0 && (
          <div className="border-t border-border/60 pt-1">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md py-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span>Riwayat ({history.length})</span>
              <ChevronDown aria-hidden className={`size-3.5 shrink-0 transition-transform duration-200 ${showHistory ? "rotate-180" : ""}`} />
            </button>
            {showHistory && (
              <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pb-1">
                {history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                      {h.source === "llm" ? "AI" : "angka"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={h.insight}>
                      {new Date(h.at).toLocaleString("id-ID")} · {h.insight.slice(0, 80)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setState({ status: "done", insight: h.insight, source: h.source, error: h.error, code: null, model: h.model, tried: null, sources: null });
                        if (h.prompt) setPrompt(h.prompt);
                        if (h.sections.length > 0) setSections(h.sections);
                      }}
                      className="shrink-0 cursor-pointer text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      buka
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      try { localStorage.removeItem(HISTORY_KEY); } catch {}
                      setHistory([]);
                      setShowHistory(false);
                    }}
                    className="cursor-pointer text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    hapus riwayat
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
        <div className="border-t border-border/60 pt-1">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            aria-controls="insight-advanced"
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md py-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span>Prompt kustom + pilih data ({sections.length}/8)</span>
            <ChevronDown
              aria-hidden
              className={`size-3.5 shrink-0 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
            />
          </button>
          {showAdvanced && (
            <div id="insight-advanced" className="flex flex-col gap-3 pb-1 pt-1.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">
                  Fokus analisis — opsional, jadi tambahan di atas instruksi bawaan
                </span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value.slice(0, MAX_USER_PROMPT_CHARS))}
                  rows={3}
                  maxLength={MAX_USER_PROMPT_CHARS}
                  placeholder="cth: kenapa cache-hit rendah? model mana yang paling boros minggu ini?"
                  aria-label="Fokus analisis kustom"
                  className="min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm leading-relaxed shadow-sm outline-none selection:bg-primary/20 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring"
                />
                <span className="self-end text-[11px] tabular-nums text-muted-foreground">
                  {prompt.length}/{MAX_USER_PROMPT_CHARS}
                </span>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {groups.map((g) => (
                  <fieldset key={g.name} className="m-0 min-w-0 border-0 p-0">
                    <legend className="mb-1 p-0 text-xs font-medium text-foreground">{g.name}</legend>
                    <div className="flex flex-col">
                      {g.items.map((item) => (
                        <label
                          key={item.key}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pr-1 text-sm leading-none"
                        >
                          <input
                            type="checkbox"
                            checked={sections.includes(item.key)}
                            onChange={(e) => toggleSection(item.key, e.target.checked)}
                            className="size-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default RouterInsight;
