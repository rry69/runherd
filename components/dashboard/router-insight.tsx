"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
export function RouterInsight() {
  const [state, setState] = React.useState<InsightState>({ status: "idle" });

  const generate = React.useCallback(async () => {
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
        body: JSON.stringify({ days: 30 }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setState({
        status: "done",
        insight: String(json.insight ?? ""),
        source: json.source === "llm" ? "llm" : "fallback",
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
      });
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
  }, []);

  const loading = state.status === "loading";

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

  return (
    <Card className="overflow-hidden rounded-lg border-border bg-card shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-muted-foreground" />
          Insight
          {state.status === "done" && (
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {state.source === "llm" ? "AI" : "angka"}
            </span>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
          {loading ? "Menulis…" : state.status === "idle" ? "Generate" : "Generate ulang"}
        </Button>
      </CardHeader>
      <CardContent>
        {state.status === "idle" && (
          <p className="text-sm text-muted-foreground">
            Ringkasan naratif opencode + 9router (30 hari) — klik Generate untuk menulis.
          </p>
        )}
        {loading && (
          <p className="animate-pulse text-sm text-muted-foreground">
            Menulis ringkasan dari data opencode + 9router…
          </p>
        )}
        {state.status === "done" && (
          <div className="flex flex-col gap-2">
            {state.error && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-amber-600 dark:text-amber-400">{state.error}</p>
                {state.code && (
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground">
                    {state.code}
                  </span>
                )}
                <button
                  type="button"
                  onClick={copyDiagnostics}
                  className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  salin diagnostik
                </button>
              </div>
            )}
            {state.insight ? (
              (() => {
                const { lead, bullets } = splitInsight(state.insight);
                return (
                  <div className="flex flex-col gap-2">
                    {lead && (
                      <p className="text-[13px] leading-relaxed text-muted-foreground">{lead}</p>
                    )}
                    {bullets.length > 0 && (
                      <ul className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()
            ) : (
              !state.error && (
                <p className="text-sm text-muted-foreground">Respons kosong — coba generate ulang.</p>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RouterInsight;
