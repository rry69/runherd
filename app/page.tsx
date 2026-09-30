"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionChart } from "@/components/dashboard/session-chart";
import { SessionTable } from "@/components/dashboard/session-table";
import { HeroStrip } from "@/components/dashboard/hero-strip";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import type { ActiveChild, SessionRow } from "@/lib/types";

const STUCK_MS = 5 * 60 * 1000;
const ATTENTION_MAX = 5;
const BREAKDOWN_MAX = 5;

function toMs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

function ageMs(timeUpdated: number, now: number): number {
  return Math.max(0, now - toMs(timeUpdated));
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m`;
  return `${Math.floor(h / 24)}h ${h % 24}j`;
}

function formatClock(t: number): string {
  try {
    const d = new Date(toMs(t));
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function Home() {
  const [rows, setRows] = React.useState<SessionRow[]>([]);
  const [activeMap, setActiveMap] = React.useState<Record<string, ActiveChild[]>>({});
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    let alive = true;
    let loadedOnce = false;
    const load = async () => {
      try {
        const [sRes, oRes] = await Promise.all([
          fetch("/api/sessions", { cache: "no-store" }),
          fetch("/api/overrides", { cache: "no-store" }),
        ]);
        if (!sRes.ok || !oRes.ok) throw new Error(`HTTP ${sRes.status}/${oRes.status}`);
        const sJson = await sRes.json();
        const oJson = await oRes.json();
        if (!alive) return;
        setRows((sJson.data ?? []) as SessionRow[]);
        setActiveMap((sJson.active ?? {}) as Record<string, ActiveChild[]>);
        setHidden((oJson.hidden ?? []) as string[]);
        setFetchError(null);
        setStale(false);
        loadedOnce = true;
      } catch (e) {
        if (!alive) return;
        setFetchError(e instanceof Error ? e.message : "fetch gagal");
        // Fetch gagal tapi data lama masih ada → poll-stale, bukan kosong.
        if (loadedOnce) setStale(true);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 1500);
    // Tick ringan agar label umur "Xm lalu" tetap segar tanpa fetch.
    const clock = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(clock);
    };
  }, []);

  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);
  const isHidden = React.useCallback(
    (r: SessionRow) => hiddenSet.has(r.id) || hiddenSet.has(`agent:${r.agent || "unknown"}`),
    [hiddenSet],
  );

  const mains = React.useMemo(
    () => rows.filter((r) => r.parent_id === null && !isHidden(r)),
    [rows, isHidden],
  );
  const hiddenCount = React.useMemo(() => rows.filter(isHidden).length, [rows, isHidden]);
  const activeCount = React.useMemo(
    () => rows.filter((r) => (activeMap[r.id]?.length ?? 0) > 0).length,
    [rows, activeMap],
  );

  const isThinking = React.useCallback(
    (id: string) => (activeMap[id]?.length ?? 0) > 0,
    [activeMap],
  );

  const perAgent = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.agent || "unknown", (m.get(r.agent || "unknown") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const perDir = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.directory, (m.get(r.directory) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // Sinyal #1: thinking dengan time_updated paling lama, oldest first, max 5.
  const attention = React.useMemo(() => {
    return mains
      .filter((r) => isThinking(r.id))
      .map((r) => ({ row: r, age: ageMs(r.time_updated, now) }))
      .sort((a, b) => b.age - a.age)
      .slice(0, ATTENTION_MAX);
  }, [mains, isThinking, now]);

  const stuckCount = React.useMemo(
    () => mains.filter((r) => isThinking(r.id) && ageMs(r.time_updated, now) > STUCK_MS).length,
    [mains, isThinking, now],
  );

  const statusMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) {
      if (!isThinking(r.id)) m[r.id] = "idle";
      else m[r.id] = ageMs(r.time_updated, now) > STUCK_MS ? "stuck" : "thinking";
    }
    return m;
  }, [rows, isThinking, now]);

  const stats = React.useMemo(
    () =>
      [
        ["Total sesi", rows.length],
        ["Agent utama", mains.length],
        ["Thinking aktif", activeCount],
        ["Hidden", hiddenCount],
      ] as const,
    [rows.length, mains.length, activeCount, hiddenCount],
  );

  const topAgents = perAgent.slice(0, BREAKDOWN_MAX);
  const topDirs = perDir.slice(0, BREAKDOWN_MAX);

  // Mapping live → mint mockup (hitung dari state poll, bukan statis).
  const heroTotal = rows.length;
  const heroActive = activeCount;
  const heroCritical = stuckCount;
  const heroWarning = attention.length;
  const kpiFailed = stuckCount;
  const kpiQueued = Math.max(0, mains.length - activeCount);

  return (
    <main className="flex w-full flex-col gap-4 bg-transparent p-4 md:p-6">
      {/* Header: status poll selalu terlihat */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Agent Dashboard</h1>
        <Badge variant="secondary">poll 1.5s</Badge>
        <Badge variant="outline">read-only</Badge>
        {loading ? (
          <Badge variant="secondary">memuat…</Badge>
        ) : fetchError && rows.length === 0 ? (
          <Badge variant="destructive">error</Badge>
        ) : stale ? (
          <Badge variant="outline">stale — data lama</Badge>
        ) : (
          <Badge variant="secondary">live</Badge>
        )}
        {stuckCount > 0 && <Badge variant="destructive">{stuckCount} stuck &gt;5m</Badge>}
      </div>

      {loading ? (
        <Card aria-busy="true">
          <CardHeader>
            <CardTitle className="text-sm">Memuat…</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-md border p-3">
                  <div className="h-3 w-20 rounded bg-secondary" />
                  <div className="mt-2 h-7 w-12 rounded bg-secondary" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : fetchError && rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Gagal memuat sesi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Fetch gagal: <span className="font-mono text-xs">{fetchError}</span>. Coba lagi —
              polling tetap jalan tiap 1.5s.
            </p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Belum ada sesi</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              0 sesi dari <span className="font-mono text-xs">GET /api/sessions</span>. State kosong
              — bukan error.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {stale && (
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Poll terakhir gagal ({fetchError ?? "unknown"}) — menampilkan data lama agar tidak
                  kosong.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Mint hero + KPI + breakdown (live mapping, pola mockup-02) */}
          <HeroStrip
            total={heroTotal}
            active={heroActive}
            critical={heroCritical}
            warning={heroWarning}
          />
          <KpiCards
            total={heroTotal}
            active={heroActive}
            failed={kpiFailed}
            queued={kpiQueued}
          />
          <BreakdownBars perAgent={topAgents} perDir={topDirs} total={rows.length} />

          {/* (d) Tren (props tidak diubah) */}
          <SessionChart rows={rows} />

          {/* (e) Tabel read-only sesi utama */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                Sesi utama
                <Badge variant="secondary" className="tabular-nums">
                  {mains.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SessionTable data={mains} statusMap={statusMap} />
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
