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
  // null = belum diketahui (fallback rows.length); fail-open: poll gagal
  // tidak menimpa total terakhir.
  const [total, setTotal] = React.useState<number | null>(null);
  const [activeMap, setActiveMap] = React.useState<Record<string, ActiveChild[]>>({});
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const [historyTotal, setHistoryTotal] = React.useState<number[]>([]);
  const [historyActive, setHistoryActive] = React.useState<number[]>([]);
  const [historyFailed, setHistoryFailed] = React.useState<number[]>([]);
  const [historyQueued, setHistoryQueued] = React.useState<number[]>([]);

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
        if (!sJson.ok) {
          setFetchError(sJson.error ?? "API sesi gagal");
          if (loadedOnce) setStale(true);
          return;
        }
        const fetchedRows = (sJson.data ?? []) as SessionRow[];
        const fetchedHidden = (oJson.hidden ?? []) as string[];
        const fetchedActive = (sJson.active ?? {}) as Record<string, ActiveChild[]>;
        const fetchedTotal = typeof sJson.total === "number" ? sJson.total : null;
        setRows(fetchedRows);
        if (fetchedTotal != null) setTotal(fetchedTotal);
        if (sJson.active != null)
          setActiveMap(sJson.active as Record<string, ActiveChild[]>);
        setHidden(fetchedHidden);
        setFetchError(null);
        setStale(false);
        loadedOnce = true;
        // History buffer polling (max 20 entri) untuk sparkline KPI.
        // Fail-open: active null → skip history agar tidak catat idle palsu.
        if (sJson.active != null) {
          const fetchedActive = sJson.active as Record<string, ActiveChild[]>;
          try {
          const hSet = new Set(fetchedHidden);
          const hHidden = (r: SessionRow) =>
            hSet.has(r.id) || hSet.has(`agent:${r.agent || "unknown"}`);
          const hTotal = fetchedTotal ?? fetchedRows.length;
          const hActive = fetchedRows.filter(
            (r) => (fetchedActive[r.id]?.length ?? 0) > 0,
          ).length;
          const hMains = fetchedRows.filter((r) => r.parent_id === null && !hHidden(r));
          const nowMs = Date.now();
          const hFailed = hMains.filter(
            (r) =>
              (fetchedActive[r.id]?.length ?? 0) > 0 &&
              Math.max(0, nowMs - toMs(r.time_updated)) > STUCK_MS,
          ).length;
          const hQueued = Math.max(0, hMains.length - hActive);
          setHistoryTotal((p) => [...p, hTotal].slice(-20));
          setHistoryActive((p) => [...p, hActive].slice(-20));
          setHistoryFailed((p) => [...p, hFailed].slice(-20));
          setHistoryQueued((p) => [...p, hQueued].slice(-20));
          } catch {
            /* abaikan — history opsional */
          }
        }
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
        ["Total sesi", total ?? rows.length],
        ["Agent utama", mains.length],
        ["Thinking aktif", activeCount],
        ["Hidden", hiddenCount],
      ] as const,
    [total, rows.length, mains.length, activeCount, hiddenCount],
  );

  const topAgents = perAgent.slice(0, BREAKDOWN_MAX);
  const topDirs = perDir.slice(0, BREAKDOWN_MAX);

  // Mapping live → mint mockup (hitung dari state poll, bukan statis).
  const heroTotal = total ?? rows.length;
  const heroActive = activeCount;
  const heroCritical = stuckCount;
  const heroWarning = attention.length;
  const kpiFailed = stuckCount;
  const kpiQueued = Math.max(0, mains.length - activeCount);

  return (
    <main className="flex w-full flex-col gap-4 bg-transparent p-4 md:p-6">
      {loading ? (
        <Card aria-busy="true" className="border-primary/30 transition-colors hover:border-primary">
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
        <Card className="border-primary/30 transition-colors hover:border-primary">
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
        <Card className="border-primary/30 transition-colors hover:border-primary">
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
            <Card className="border-dashed border-primary/30 transition-colors hover:border-primary">
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
            history={{
              total: historyTotal,
              active: historyActive,
              failed: historyFailed,
              queued: historyQueued,
            }}
          />
          <BreakdownBars perAgent={topAgents} perDir={topDirs} total={rows.length} />

          {/* (d) Tren (props tidak diubah) */}
          <SessionChart rows={rows} />

          {/* (e) Tabel read-only sesi utama */}
          <Card className="border-primary/30 transition-colors hover:border-primary">
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
