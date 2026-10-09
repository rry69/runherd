"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionTable } from "@/components/dashboard/session-table";
import { HeroStrip } from "@/components/dashboard/hero-strip";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { FullPageLoader } from "@/components/dashboard/fullpage-loader";
import { RouterAttribution } from "@/components/dashboard/router-attribution";
import { RouterCards } from "@/components/dashboard/router-cards";
import { RouterInsight } from "@/components/dashboard/router-insight";
import { RouterTrend } from "@/components/dashboard/router-trend";
import { isStuck, isThinkingNow } from "@/lib/live-status";
import { ActiveSessionsPopup } from "@/components/dashboard/active-sessions-popup";
import type { ActiveChild, LiveMap, RouterStats, SessionRow, TokenStats } from "@/lib/types";
import { WF_TO_STATUS, type KanbanColumn } from "@/components/dashboard/sessions-kanban/types";

const BREAKDOWN_MAX = 5;
// Kunci `workflow` yang valid (payload berasal dari file JSON user → bisa
// berisi string asing; tanpa validasi, label jadi "undefined").
const WF_KEYS = new Set<string>(["thinking", "done"]);

export default function Home() {
  const [rows, setRows] = React.useState<SessionRow[]>([]);
  // null = belum diketahui (fallback rows.length); fail-open: poll gagal
  // tidak menimpa total terakhir.
  const [total, setTotal] = React.useState<number | null>(null);
  const [activeMap, setActiveMap] = React.useState<Record<string, ActiveChild[]>>({});
  // Fail-open: field `live` hilang saat DB error → pertahankan peta terakhir,
  // jangan kosongkan (biarkan kartu melekat pada status terakhir, bukan auto-idle).
  const [liveMap, setLiveMap] = React.useState<LiveMap>({});
  // Cermin sticky peta live: dipakai sinkron di dalam load() (state React
  // masih basi di dalam closure yang sama).
  const liveRef = React.useRef<LiveMap>({});
  // Override kolom kanban per sesi (dipindah manual di /sessions). Fail-open:
  // kunci `workflow` hilang saat DB error → pertahankan peta terakhir, jangan
  // kosongkan (mengosongkan = label balik "idle" padahal kartu sudah di-Move).
  const [workflow, setWorkflow] = React.useState<Record<string, string>>({});
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  // Agregat token global (endpoint terpisah, poll 60s — bukan 1.5s).
  // Fail-open: fetch gagal → pertahankan angka terakhir, bukan 0.
  const [tokenStats, setTokenStats] = React.useState<TokenStats | null>(null);
  // Data 9router dipoll terpisah agar tidak ikut ritme 1.5s sesi.
  // Gagal fetch tidak menghapus angka terakhir (fail-open).
  const [routerStats, setRouterStats] = React.useState<RouterStats | null>(null);
  const routerStatsRef = React.useRef<RouterStats | null>(null);
  const [routerStale, setRouterStale] = React.useState(false);
  const [routerError, setRouterError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    let loadedOnce = false;
    let inFlight = false;
    // Gimmik min-loading: loader awal ditahan minimal 800ms sejak
    // mount agar tidak berkedip. Hanya berlaku untuk load pertama
    // kali; polling berikutnya tidak pernah mengembalikan
    // loading ke true.
    const started = Date.now();
    let minTimer: ReturnType<typeof setTimeout> | undefined;
    // Pengaman: API lambat (DB 300MB+, scan sync) tidak boleh
    // menahan loader selamanya — paksa selesai max 15s.
    const maxTimer = setTimeout(() => {
      if (alive && !loadedOnce) {
        setFetchError("timeout 15s — API lambat, menampilkan apa adanya");
        setLoading(false);
      }
    }, 15000);
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      const firstLoad = !loadedOnce;
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      try {
        const [sRes, oRes] = await Promise.all([
          fetch("/api/sessions?lite=1", { cache: "no-store", signal: ctrl.signal }),
          fetch("/api/overrides", { cache: "no-store", signal: ctrl.signal }),
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
        const fetchedTotal = typeof sJson.total === "number" ? sJson.total : null;
        setRows(fetchedRows);
        if (fetchedTotal != null) setTotal(fetchedTotal);
        if (sJson.active != null)
          setActiveMap(sJson.active as Record<string, ActiveChild[]>);
        if (sJson.live != null) {
          liveRef.current = sJson.live as LiveMap;
          setLiveMap(liveRef.current);
        }
        if (sJson.workflow != null) {
          setWorkflow(sJson.workflow as Record<string, string>);
        }
        setHidden(fetchedHidden);
        setFetchError(null);
        setStale(false);
        loadedOnce = true;
      } catch (e) {
        if (!alive) return;
        setFetchError(e instanceof Error ? e.message : "fetch gagal");
        // Fetch gagal tapi data lama masih ada → poll-stale, bukan kosong.
        if (loadedOnce) setStale(true);
      } finally {
        clearTimeout(to);
        inFlight = false;
        if (!alive) return;
        if (firstLoad) {
          const elapsed = Date.now() - started;
          const wait = Math.max(0, 800 - elapsed);
          if (wait > 0) {
            minTimer = setTimeout(() => {
              if (alive) setLoading(false);
            }, wait);
          } else {
            setLoading(false);
          }
          return;
        }
        setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 1500);
    // Token: endpoint agregat terpisah, poll 60s (full-scan message, jangan
    // ikut poll 1.5s). Fail-open: gagal → angka terakhir dipertahankan.
    const loadTokens = async () => {
      try {
        const res = await fetch("/api/tokens", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive || !json.ok || json.tokens == null) return;
        setTokenStats(json.tokens as TokenStats);
      } catch {
        /* abaikan — angka terakhir dipertahankan */
      }
    };
    loadTokens();
    const tt = setInterval(loadTokens, 60000);
    // Router: usageDaily berubah harian saja; polling 60s bukan 1.5s.
    const loadRouter = async () => {
      try {
        const res = await fetch("/api/router", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        if (!json.ok || json.router == null) {
          setRouterError(json.error ?? "API router gagal");
          if (routerStatsRef.current != null) setRouterStale(true);
          return;
        }
        const nextStats = json.router as RouterStats;
        routerStatsRef.current = nextStats;
        setRouterStats(nextStats);
        setRouterError(null);
        setRouterStale(false);
      } catch (e) {
        if (!alive) return;
        setRouterError(e instanceof Error ? e.message : "fetch gagal");
        setRouterStale((previous) => previous || routerStatsRef.current != null);
      }
    };
    loadRouter();
    const rt = setInterval(loadRouter, 60000);
    // Tick ringan agar label umur "Xm lalu" tetap segar tanpa fetch.
    const clock = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      alive = false;
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      clearInterval(t);
      clearInterval(tt);
      clearInterval(rt);
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
  const isThinking = React.useCallback(
    (id: string) => isThinkingNow(activeMap[id]?.length ?? 0, liveMap[id] ?? 0),
    [activeMap, liveMap],
  );

  // Hanya sesi main: child session tidak pernah tampil di tabel, jadi menghitungnya
  // membuat "active" lebih besar dari yang bisa dilihat user.
  const activeMains = React.useMemo(
    () =>
      mains.filter(
        (r) =>
          isThinking(r.id) &&
          !isStuck(r.time_updated, activeMap[r.id]?.length ?? 0, liveMap[r.id] ?? 0, now),
      ),
    [mains, isThinking, activeMap, liveMap, now],
  );
  const activeMainsCount = activeMains.length;


  const overviewMains = React.useMemo(
    () =>
      mains.map((r) =>
        (r as { source?: string }).source === "hermes" ? { ...r, agent: "Hermes" } : r,
      ),
    [mains],
  );

  const perAgent = React.useMemo(() => {
    const m = new Map<string, number>();
    // Agent murni opencode + agregat Hermes (source === "hermes" → "Hermes").
    // Fallback model/source hermes (grip/codebuddy/muse-spark-*) tidak dihitung satuan.
    for (const r of rows) {
      const key =
        (r as { source?: string }).source === "hermes" ? "Hermes" : r.agent || "unknown";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const perDir = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.directory, (m.get(r.directory) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const stuckCount = React.useMemo(
    () =>
      mains.filter((r) =>
        isStuck(r.time_updated, activeMap[r.id]?.length ?? 0, liveMap[r.id] ?? 0, now),
      ).length,
    [mains, activeMap, liveMap, now],
  );

  const statusMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) {
      if (isThinking(r.id)) {
        m[r.id] = isStuck(r.time_updated, activeMap[r.id]?.length ?? 0, liveMap[r.id] ?? 0, now)
          ? "failed"
          : "thinking";
        continue;
      }
      // Tanpa sinyal live, label ikut override workflow supaya sama dengan
      // kanban (bukan "idle" permanen setelah kartu di-Move di /sessions).
      const wf = workflow[r.id];
      if (typeof wf !== "string" || !WF_KEYS.has(wf)) {
        m[r.id] = "idle";
        continue;
      }
      m[r.id] = WF_TO_STATUS[wf as KanbanColumn] ?? "idle";
    }
    return m;
  }, [rows, isThinking, activeMap, liveMap, now, workflow]);

  const topAgents = perAgent.slice(0, BREAKDOWN_MAX);
  const topDirs = perDir.slice(0, BREAKDOWN_MAX);
  const tokensBySession = React.useMemo(
    () => Object.fromEntries((tokenStats?.bySession ?? []).map((entry) => [entry.session, entry.total])),
    [tokenStats],
  );

  // Mapping live → mint mockup (hitung dari state poll, bukan statis).
  const heroTotal = total ?? rows.length;
  const heroActive = activeMainsCount;
  const kpiFailed = stuckCount;
  const kpiQueued = Math.max(0, mains.length - activeMainsCount - stuckCount);
  const routerSection = (
    <section aria-labelledby="router-overview-title" className="flex flex-col gap-3">
      <div>
        <h2 id="router-overview-title" className="text-base font-semibold">Stat KPI 9Router</h2>
        <p className="text-xs text-muted-foreground">Biaya, penggunaan token, dan throughput 30 hari terakhir</p>
      </div>
      {routerStale && (
        <Card className="border-dashed border-amber-600/30 bg-amber-600/[0.06] shadow-none dark:border-amber-400/30 dark:bg-amber-400/[0.03]">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Poll router terakhir gagal ({routerError ?? "unknown"}) — angka terakhir tetap ditampilkan.
            </p>
          </CardContent>
        </Card>
      )}
      {routerStats ? (
        <div className="flex flex-col gap-5">
          <RouterCards stats={routerStats} />
          <RouterInsight stats={routerStats} />
          <RouterTrend daily={routerStats.daily} />
          <RouterAttribution stats={routerStats} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {routerError ? `Data 9router belum tersedia (${routerError}).` : "Memuat data 9router…"}
        </p>
      )}
    </section>
  );

  return (
    <main className="flex w-full min-w-0 flex-col gap-5 bg-transparent px-3 py-4 sm:p-4 md:p-6">
      {!loading && (
        <div className="content-fade-in mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-5">
          {fetchError && rows.length === 0 ? (
            <Card className="rounded-lg border-border bg-card shadow-none">
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
            <Card className="rounded-lg border-border bg-card shadow-none">
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
                <Card className="rounded-lg border-dashed border-amber-600/30 bg-amber-600/[0.06] shadow-none dark:border-amber-400/20 dark:bg-amber-400/[0.03]">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      Poll terakhir gagal ({fetchError ?? "unknown"}) — menampilkan data lama agar tidak
                      kosong.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Overview header, KPIs, breakdown, charts, and main-session table */}
              <HeroStrip
                total={heroTotal}
                active={heroActive}
              />
              <section aria-labelledby="opencode-kpi-title" className="flex flex-col gap-3">
                <div>
                  <h2 id="opencode-kpi-title" className="text-base font-semibold">Stat KPI OpenCode</h2>
                </div>
                <KpiCards
                total={heroTotal}
                active={heroActive}
                failed={kpiFailed}
                queued={kpiQueued}
                tokens={
                  tokenStats
                    ? {
                        total: tokenStats.total,
                        detail: `in ${(tokenStats.input / 1e6).toFixed(1)}M · out ${(tokenStats.output / 1e6).toFixed(1)}M`,

                      }
                    : null
                }
                />
              </section>

              {/* Router analytics rapat di bawah KPI OpenCode. */}
              {routerSection}
              <BreakdownBars perAgent={topAgents} perDir={topDirs} total={rows.length} />

              {/* (e) Tabel read-only sesi utama */}
              <Card className="min-w-0 overflow-hidden rounded-lg border-border bg-card shadow-none">
                <CardHeader className="px-4 pb-4 pt-4 sm:px-6 sm:pt-6">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    Sesi utama
                    <Badge variant="secondary" className="rounded-md tabular-nums">
                      {overviewMains.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 px-2 pb-4 sm:px-6 sm:pb-6 sm:pt-6">
                  <SessionTable data={overviewMains} statusMap={statusMap} tokenMap={tokensBySession} />
                </CardContent>
              </Card>
            </>
          )}
          {rows.length === 0 && routerSection}
        </div>
      )}
      <FullPageLoader visible={loading} />
      {/* Selalu mount: exit diurus internal via display/leaving.
          Conditional length>0 unmount langsung → popup-out tak sempat jalan. */}
      {!loading && <ActiveSessionsPopup items={activeMains} />}
    </main>
  );
}
