"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import BorderGlow from "@/components/BorderGlow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionChart } from "@/components/dashboard/session-chart";
import { SessionTable } from "@/components/dashboard/session-table";
import { HeroStrip } from "@/components/dashboard/hero-strip";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { FullPageLoader } from "@/components/dashboard/fullpage-loader";
import { activeForMs, isStuck, isThinkingNow } from "@/lib/live-status";
import type { ActiveChild, LiveMap, SessionRow } from "@/lib/types";
import { WF_TO_STATUS, type KanbanColumn } from "@/components/dashboard/sessions-kanban/types";

const ATTENTION_MAX = 5;
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
  const [historyTotal, setHistoryTotal] = React.useState<number[]>([]);
  const [historyActive, setHistoryActive] = React.useState<number[]>([]);
  const [historyFailed, setHistoryFailed] = React.useState<number[]>([]);
  const [historyQueued, setHistoryQueued] = React.useState<number[]>([]);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isGlowTable = mounted && resolvedTheme === "dark";

  React.useEffect(() => {
    let alive = true;
    let loadedOnce = false;
    // Gimmik min-loading: loader awal ditahan minimal 800ms sejak
    // mount agar tidak berkedip. Hanya berlaku untuk load pertama
    // kali; polling 1.5s berikutnya tidak pernah mengembalikan
    // loading ke true.
    const started = Date.now();
    let minTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const firstLoad = !loadedOnce;
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
        // History buffer polling (max 20 entri) untuk sparkline KPI.
        // Fail-open: active null → skip history agar tidak catat idle palsu.
        if (sJson.active != null) {
          const fetchedActive = sJson.active as Record<string, ActiveChild[]>;
          // `active` dan `live` dari dua query terpisah, jadi `live` bisa
          // hilang saat `active` masih ada; pakai peta sticky supaya
          // sparkline tidak mencatat idle palsu.
          const fetchedLive = liveRef.current;
          try {
          const hSet = new Set(fetchedHidden);
          const hHidden = (r: SessionRow) =>
            hSet.has(r.id) || hSet.has(`agent:${r.agent || "unknown"}`);
          const hTotal = fetchedTotal ?? fetchedRows.length;
          // hMains dulu: sparkline harus Basis hitungan sama dengan tabel
          // (hanya sesi main) — child session tidak pernah tampil di tabel.
          const hMains = fetchedRows.filter((r) => r.parent_id === null && !hHidden(r));
          const hActive = hMains.filter((r) =>
            isThinkingNow(fetchedActive[r.id]?.length ?? 0, fetchedLive[r.id] ?? 0),
          ).length;
          const nowMs = Date.now();
          const hFailed = hMains.filter((r) =>
            isStuck(r.time_updated, fetchedActive[r.id]?.length ?? 0, fetchedLive[r.id] ?? 0, nowMs),
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
    // Tick ringan agar label umur "Xm lalu" tetap segar tanpa fetch.
    const clock = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      alive = false;
      clearTimeout(minTimer);
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
  const isThinking = React.useCallback(
    (id: string) => isThinkingNow(activeMap[id]?.length ?? 0, liveMap[id] ?? 0),
    [activeMap, liveMap],
  );

  // Hanya sesi main: child session tidak pernah tampil di tabel, jadi menghitungnya
  // membuat "active" lebih besar dari yang bisa dilihat user.
  const activeMainsCount = React.useMemo(
    () => mains.filter((r) => isThinking(r.id)).length,
    [mains, isThinking],
  );

  // Umur fase AKTIF, bukan umur sesi: `time_updated` beku selama model
  // berpikir, jadi turn tanpa tool harus diukur dari `liveSince`.
  const activeFor = React.useCallback(
    (r: SessionRow) =>
      activeForMs(r.time_updated, activeMap[r.id]?.length ?? 0, liveMap[r.id] ?? 0, now),
    [activeMap, liveMap, now],
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

  // Sinyal #1: sesi working dengan fase aktif paling lama, oldest first, max 5.
  const attention = React.useMemo(() => {
    return mains
      .filter((r) => isThinking(r.id))
      .map((r) => ({ row: r, age: activeFor(r) }))
      .sort((a, b) => b.age - a.age)
      .slice(0, ATTENTION_MAX);
  }, [mains, isThinking, activeFor]);

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

  // Mapping live → mint mockup (hitung dari state poll, bukan statis).
  const heroTotal = total ?? rows.length;
  const heroActive = activeMainsCount;
  const heroCritical = stuckCount;
  const heroWarning = attention.length;
  const kpiFailed = stuckCount;
  const kpiQueued = Math.max(0, mains.length - activeMainsCount);

  return (
    <main className="flex w-full flex-col gap-6 bg-transparent p-4 md:p-6">
      {!loading && (
        <div className="content-fade-in flex flex-col gap-6">
          {fetchError && rows.length === 0 ? (
            <Card className="border border-primary/20 bg-transparent shadow-none transition-colors hover:border-primary">
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
            <Card className="border border-primary/20 bg-transparent shadow-none transition-colors hover:border-primary">
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
                <Card className="border border-dashed border-primary/20 bg-transparent shadow-none transition-colors hover:border-primary">
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
              {isGlowTable ? (
                <BorderGlow
                  glowColor="40 80 80"
                  backgroundColor="#120F17"
                  borderRadius={16}
                  glowRadius={40}
                  glowIntensity={1.0}
                  coneSpread={25}
                  animated={false}
                  edgeSensitivity={30}
                  colors={["#c084fc", "#f472b6", "#38bdf8"]}
                  fillOpacity={0.5}
                >
                  <Card className="border-0 bg-transparent rounded-2xl overflow-hidden">
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
                </BorderGlow>
              ) : (
                <Card className="border border-primary/20 bg-transparent shadow-none transition-colors hover:border-primary">
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
              )}
            </>
          )}
        </div>
      )}
      <FullPageLoader visible={loading} />
    </main>
  );
}
