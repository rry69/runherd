"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RouterBreakdown, RouterStats } from "@/lib/types";
import { fmt2, fullNum } from "@/lib/utils";
import { downloadText, stamp, toCSV } from "@/lib/export";

export type RouterAttributionProps = {
  stats: RouterStats | null;
};

function wastedOf(b: RouterBreakdown): number {
  return b.cost * (1 - b.cacheHit / 100);
}

function shortKey(key: string): string {
  // `model|provider` / `key|model|provider` → tampilkan segmen pertama yang bermakna.
  const parts = key.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return key;
  // byApiKey ter-mask: `sk-…xxxx|model|provider` → tampilkan model|provider + key pendek.
  if (parts[0].startsWith("sk-")) return `${parts.slice(1).join(" · ")} (${parts[0]})`;
  return parts.join(" · ");
}

function BreakdownTable({ rows, caption }: { rows: RouterBreakdown[]; caption: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-semibold">key</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">req</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">cost</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">$/1k</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">cache</th>
            <th scope="col" className="py-2 text-right font-semibold">wasted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/50 last:border-0">
              <td className="max-w-[220px] truncate py-2 pr-3 text-[11.5px]" title={r.key}>
                {shortKey(r.key)}
              </td>
              <td className="py-2 pr-3 text-right text-[11.5px] tabular-nums">{fullNum(r.requests)}</td>
              <td className="py-2 pr-3 text-right text-[11.5px] tabular-nums" title={`${r.cost}`}>
                ${fmt2(r.cost)}
              </td>
              <td className="py-2 pr-3 text-right text-[11.5px] tabular-nums" title={`${r.costPer1k}`}>
                ${fmt2(r.costPer1k)}
              </td>
              <td className="py-2 pr-3 text-right text-[11.5px] tabular-nums">{fmt2(r.cacheHit)}%</td>
              <td className="py-2 text-right text-[11.5px] tabular-nums text-amber-600 dark:text-amber-400" title={`${wastedOf(r)}`}>
                ${fmt2(wastedOf(r))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Cost attribution + efficiency breakdown. Bukan per-sesi opencode
 * (mustahil: usageHistory.meta kosong) — melainkan per provider/model/
 * apiKey/endpoint dari usageDaily. `wasted` = cost × (1 − cacheHit).
 */
export function RouterAttribution({ stats }: RouterAttributionProps) {
  if (!stats) return null;
  const providers = stats.byProvider ?? [];
  const models = stats.byModel ?? [];
  const apiKeys = stats.byApiKey ?? [];
  const endpoints = stats.byEndpoint ?? [];
  const topWaster = [...providers].sort((a, b) => wastedOf(b) - wastedOf(a))[0] ?? null;

  const exportAll = () => {
    const csv = (label: string, rows: RouterBreakdown[]) =>
      [`# ${label}`, "key,requests,cost,costPer1k,cacheHit,promptTokens,completionTokens,cachedTokens", ...rows.map((r) => toCSV([], [[r.key, r.requests, r.cost, r.costPer1k, r.cacheHit, r.promptTokens, r.completionTokens, r.cachedTokens]]))].join("\n");
    const out = [
      `# attribution ${stats.dayCount} hari s/d ${stats.lastDate}`,
      csv("byProvider", providers),
      csv("byModel", models),
      csv("byApiKey", apiKeys),
      csv("byEndpoint", endpoints),
    ].join("\n");
    downloadText(`router-attribution-${stamp()}.csv`, out, "text/csv;charset=utf-8");
  };

  return (
    <Card className="overflow-hidden rounded-lg border-border bg-card shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-sm">Attribution & efisiensi</CardTitle>
          <p className="text-xs text-muted-foreground">
            Per provider/model/key/endpoint · bukan per-sesi opencode (tak terlacak di DB) · wasted = biaya tak ter-cache
          </p>
        </div>
        <button type="button" onClick={exportAll} title="Export semua breakdown ke CSV" className="shrink-0 cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          CSV
        </button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {topWaster && wastedOf(topWaster) > 0 && (
          <p className="rounded-md border border-amber-600/30 bg-amber-600/[0.06] px-3 py-2 text-xs text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/[0.04] dark:text-amber-300">
            Top waster: <span>{shortKey(topWaster.key)}</span> — ${fmt2(wastedOf(topWaster))} dari
            ${fmt2(topWaster.cost)} tak ter-cache ({fmt2(topWaster.cacheHit)}% hit).
          </p>
        )}
        <section aria-label="Biaya per provider">
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">PROVIDER · sort cost</h3>
          <BreakdownTable rows={providers} caption="Biaya per provider" />
        </section>
        <section aria-label="Throughput per model">
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">MODEL · sort request</h3>
          <BreakdownTable rows={models} caption="Throughput per model" />
        </section>
        {apiKeys.length > 0 && (
          <section aria-label="Biaya per API key">
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">API KEY · sort cost (ter-mask)</h3>
            <BreakdownTable rows={apiKeys} caption="Biaya per API key" />
          </section>
        )}
        {endpoints.length > 0 && (
          <section aria-label="Throughput per endpoint">
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">ENDPOINT · sort request</h3>
            <BreakdownTable rows={endpoints} caption="Throughput per endpoint" />
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default RouterAttribution;
