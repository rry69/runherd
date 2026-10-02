"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FullPageLoader } from "@/components/dashboard/fullpage-loader";
import { RouterCards } from "@/components/dashboard/router-cards";
import {
  RouterBreakdownTable,
  RouterTrend,
} from "@/components/dashboard/router-trend";
import type { RouterStats } from "@/lib/types";

/**
 * /router — anggaran/biaya, token, throughput dari 9router.
 *
 * Sumber angka: `GET /api/router` → `getRouterStats()` → tabel `usageDaily`
 * 9router (satu baris per hari, sudah teragregat). Poll 60s, bukan 1.5s seperti
 * /sessions: `usageDaily` hanya berubah saat 9router menutup hari, jadi poll
 * cepat hanya membakar CPU.
 *
 * Fail-open (sama seperti halaman lain): `ok:false` atau field `router` hilang
 * → angka terakhir dipertahankan, bukan diganti 0. State `null` yang benar
 *-benar kosong (belum pernah sukses) → tampilkan penjelasan, bukan zeroes.
 */
export default function RouterPage() {
  // null = belum diketahui; objek = angka terakhir yang diketahui.
  const [stats, setStats] = React.useState<RouterStats | null>(null);
  const [loadedOnce, setLoadedOnce] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    let loaded = false;
    // Gimmik min-loading identik beranda: loader awal ditahan minimal 800ms
    // supaya tidak berkedip. Hanya berlaku untuk load pertama.
    const started = Date.now();
    let minTimer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      const firstLoad = !loaded;
      try {
        const res = await fetch("/api/router", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        if (!json.ok) {
          setFetchError(json.error ?? "API router gagal");
          if (loaded) setStale(true);
          return;
        }
        if (json.router != null) {
          setStats(json.router as RouterStats);
          setFetchError(null);
          setStale(false);
        }
        loaded = true;
        setLoadedOnce(true);
      } catch (e) {
        if (!alive) return;
        setFetchError(e instanceof Error ? e.message : "fetch gagal");
        if (loaded) setStale(true);
      } finally {
        if (!alive) return;
        if (firstLoad) {
          const wait = Math.max(0, 800 - (Date.now() - started));
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
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearTimeout(minTimer);
      clearInterval(t);
    };
  }, []);

  return (
    <main className="flex w-full flex-col gap-6 bg-transparent p-4 md:p-6">
      {!loading && (
        <div className="content-fade-in flex flex-col gap-6">
          {stale && (
            <Card className="border border-dashed border-primary/20 bg-transparent shadow-none transition-colors hover:border-primary">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Poll terakhir gagal ({fetchError ?? "unknown"}) — menampilkan angka lama agar
                  tidak kosong.
                </p>
              </CardContent>
            </Card>
          )}

          {stats == null ? (
            <Card className="border border-primary/20 bg-transparent shadow-none transition-colors hover:border-primary">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  {loadedOnce
                    ? "DB 9router tidak terbaca."
                    : "Memuat data 9router… atau DB belum terbaca."}{" "}
                  Sumber:{" "}
                  <span className="font-mono text-xs">
                    %APPDATA%\9router\db\data.sqlite
                  </span>{" "}
                  tabel <span className="font-mono text-xs">usageDaily</span>. Error:{" "}
                  <span className="font-mono text-xs">{fetchError ?? "tidak ada data"}</span>.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <RouterCards stats={stats} />
              <RouterTrend daily={stats.daily} />
              <RouterBreakdownTable
                title="Biaya per provider"
                subtitle="Diurutkan dari biaya tertinggi. Klik header untuk mengurutkan ulang."
                rows={stats.byProvider}
                defaultSort={{ id: "cost", desc: true }}
              />
              <RouterBreakdownTable
                title="Throughput per model"
                subtitle={`Kunci format "model|provider" seperti yang dipakai 9router. Periode ${stats.dayCount} hari.`}
                rows={stats.byModel}
                defaultSort={{ id: "requests", desc: true }}
              />

              {/* Callout honesty: tanpa ini angka $10,66 disalahbaca sebagai
                  "biaya repo ini". 9router tidak mencatat session-id, jadi
                  agregar ini milik SEMUA client (opencode, Hermes, Claude Code,
                  tool lain) dan tidak bisa dipisah per repo. */}
              <Card className="border border-dashed border-primary/20 bg-transparent shadow-none">
                <CardContent className="pt-6">
                  <p className="text-sm font-medium">Angka ini milik semua client, bukan satu repo</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>
                      Sumber: <span className="font-mono">usageDaily</span> 9router — satu
                      baris per hari, sudah teragregat. {stats.dayCount} baris yang dibaca,
                      bukan scan tabel mentah.
                    </li>
                    <li>
                      9router tidak menyimpan session-id pada log request, jadi biaya
                      per sesi (atau per repo) tidak bisa ditelusuri. opencode sendiri
                      menulis <span className="font-mono">cost: 0</span> di DB-nya.
                    </li>
                    <li>
                      Periode {stats.dayCount} hari terakhir. Angka hanya berubah saat
                      9router menutup hari; poll 60s.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
      <FullPageLoader visible={loading} />
    </main>
  );
}