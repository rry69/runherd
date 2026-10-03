<h1 align="center">runherd</h1>

<p align="center">Observer dashboard read-only untuk sesi <b>opencode</b> + analitik biaya <b>9router</b> — pantau agent mana yang thinking, stuck, idle, berapa token terpakai, file apa yang diubah, dan berapa biaya router per provider/model dalam satu aplikasi.</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js&logoColor=white" alt="Next.js 16.3" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black" alt="React 19.2" />
  <img src="https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-Private-red" alt="License Private" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
</p>

<p align="center">Demo: <code>http://localhost:1122</code> · Repo: <a href="https://github.com/rry69/runherd">github.com/rry69/runherd</a></p>

## Daftar Isi

- [Fitur](#fitur)
- [Halaman](#halaman)
- [API](#api)
- [Sumber Data](#sumber-data)
- [Prinsip](#prinsip)
- [Setup](#setup)
- [Scripts](#scripts)
- [Struktur Proyek](#struktur-proyek)
- [Polling & Cache](#polling--cache)
- [Logika Status Live](#logika-status-live)
- [Keterbatasan](#keterbatasan)
- [Tech Stack](#tech-stack)

## Fitur

- **Live session tracking** — status `thinking / queued / failed / idle / done` dari dua sinyal: part tool `running` + turn assistant yang sedang streaming tanpa tool call.
- **Stuck detection** — part running > 5 menit = `failed`; turn streaming tanpa tool > 15 menit = orphan `failed`.
- **Kanban Sessions** — kolom `Thinking` / `Done`, drag/move manual (persist), rename alias, hide sesi, filter search + chip status + tab agent.
- **Inspector** — per sesi: riwayat subagent (`tool=task`), riwayat thinking main agent per prompt user, timeline 100 tool terakhir (main vs sub), file berubah (`+added / -deleted` dari `filediff.patch`), token subtree, report/error/truncated jujur dari DB.
- **Token analytics** — agregat global khusus model bawaan opencode (`providerID='opencode'`), harian 7 hari + top model + total per root session (subagent di-roll-up ke root).
- **Router analytics (/router)** — biaya, requests, tokens, cache-hit 30 hari dari 9router `usageDaily`; tren dual-axis (ECharts) + tabel sortable per provider & per model; angka penuh tanpa pembulatan.
- **Fail-open** — DB error / poll gagal = tampilkan data terakhir + badge stale, bukan nol palsu atau layar kosong.
- **Dark/light theme**, glow cards (dark), polling adaptif, full-page loader min 800ms anti-kedip.

## Halaman

### `/` — Overview

Hero strip (total / aktif / kritis / warning) + 4 KPI cards dengan sparkline 20 poll terakhir (total, aktif, failed, queued) + kartu token global. Breakdown top-5 per agent & per directory. Chart area distribusi sesi. Tabel read-only sesi utama (hanya `parent_id IS NULL`, child tidak dihitung di KPI).

### `/sessions` — Kanban

Poll 1s. Kartu thinking tampil inline sebagai panel penuh (bukan modal); kartu done tampil sebagai grid + klik untuk Inspector modal. Toolbar: search (`alias/title/id/agent/dir`), chip `thinking/queued/failed/idle`, tab agent dinamis. Aksi per kartu: rename alias, hide, move thinking↔done. Alias subagent otomatis nama Nordik deterministik (FNV-1a hash, stabil antar restart); alias manual user selalu menang.

### `/router` — Biaya & Throughput 9router

Poll 60s (data harian, poll cepat hanya bakar CPU). KPI: total cost, requests, total tokens, cache-hit + rata-rata per hari, cost/1k req, hari berbayar (`billableDays`). Tren harian cost (garis dashed animasi) vs requests (garis solid + glow) dual-axis. Tabel per provider (sort default cost) & per model kunci `model|provider` (sort default requests). Callout jujur: angka milik **semua client** 9router (opencode, Hermes, Claude Code, dll) — tidak bisa dipisah per repo karena `usageHistory.meta` kosong.

## API

| Endpoint | Sumber | Keterangan |
|---|---|---|
| `GET /api/sessions` | `opencode.db` | rows (limit 200) + `total` count, `names`, `active`, `live`, `workflow`, `tasks` (+main thinking merged), `tools` (cap 100/root), `changedFiles` (cap 50/root), `derived` |
| `GET /api/tokens` | `opencode.db` message | agregat builtin-only, cache in-memory 45s |
| `GET /api/router` | 9router `usageDaily` | 30 hari, cache in-memory 45s |
| `GET /api/overrides` | `data/web-overrides.json` | `{ aliases, hidden, workflow }` |
| `PUT /api/overrides` | file | simpan overrides (atomic write via tmp+rename) |
| `POST /api/overrides` | file | assign alias Nordik untuk subagent tanpa alias |

Semua API gagal secara fail-open: `{ ok: false, error }` agar klien sticky (pertahankan angka terakhir).

## Sumber Data

| Sumber | Path | Akses |
|---|---|---|
| opencode DB | `C:\Users\Hrry\.local\share\opencode\opencode.db` | `better-sqlite3` readonly, WAL, tanpa copy (±10GB — copy per poll bikin disk 100%) |
| 9router DB | `C:\Users\Hrry\AppData\Roaming\9router\db\data.sqlite` | readonly, hanya tabel `usageDaily` (~31 baris, ~1ms); `usageHistory` (82rb baris) tidak disentuh |
| overrides | `data/web-overrides.json` | satu-satunya file writable |

Path DB hardcoded di `lib/opencode-db.ts` (`SRC`) dan `lib/router-db.ts` (`SRC`). Tanpa 9router DB, halaman `/router` tampil penjelasan + error, halaman lain tetap jalan.

## Prinsip

1. **Read-only** — tidak ada `INSERT/UPDATE/DELETE` ke DB sumber.
2. **Fail-open, bukan nol palsu** — field hilang saat DB error → klien pertahankan state terakhir.
3. **Tanpa mock** — semua angka dari DB; sesi tanpa pesan = field `null` (UI sembunyikan), bukan 0.
4. **Presisi penuh** — `/router` dilarang `compact()`/pembulatan; `title` hover selalu angka penuh untuk disalin.
5. **Satu rumus status** — `lib/live-status.ts` dipakai API + Overview + Kanban; ubah di satu tempat, ketiga layar ikut.

## Setup

Prasyarat: **Node.js 20+**, npm, dan (opsional tapi utama) file `opencode.db` di path di atas. Untuk halaman `/router` butuh instalasi 9router CLI global + DB-nya.

```powershell
# 1. clone + masuk
git clone <url-runherd>
cd dashboard-agent

# 2. install
npm install

# 3. dev (default Next.js :3000)
npm run dev
# buka http://localhost:3000

# 4. production di port 1122 (cara termudah, Windows)
.\start-dashboard.bat
# = npm run build + npm run start -- -p 1122
# buka http://localhost:1122

# manual tanpa .bat:
npm run build
npm run start -- -p 1122
```

Tanpa argumen `-p`, `npm run start` jalan di `:3000`. Tidak ada `.env` / API key yang dibutuhkan — dashboard membaca SQLite lokal langsung.

Verifikasi cepat:

```powershell
npm run lint        # target: tidak menambah error baru (baseline punya 7 error/7 warning)
npm run build       # harus hijau; catatan: build hijau TIDAK menjamin warna chart benar (cek visual)
```

## Scripts

| Script | Perintah |
|---|---|
| dev | `next dev` |
| build | `next build` |
| start | `next start` (tambah `-p 1122` untuk port produksi) |
| lint | `eslint` |

`start-dashboard.bat` = build + start di `1122` + `pause`.

## Struktur Proyek

```
app/
  page.tsx            # / Overview (poll 1.5s + token 60s)
  sessions/page.tsx   # /sessions → SessionsKanban
  router/page.tsx     # /router (poll 60s)
  api/sessions/route.ts  api/tokens/route.ts
  api/router/route.ts    api/overrides/route.ts
components/
  app-sidebar.tsx     # nav Overview/Sessions/Router
  dashboard/
    hero-strip.tsx kpi-cards.tsx breakdown-bars.tsx
    session-chart.tsx session-table.tsx
    router-cards.tsx router-trend.tsx   # ECharts dual-axis + tabel TanStack
    SessionGraph.tsx SessionNode.tsx    # graph ReactFlow+dagre (legacy/alt view)
    sessions-kanban/  # SessionsKanban, Toolbar, SessionCard, DoneGrid, Inspector
  evilcharts/         # vendored echarts-composed-chart + ui (jangan upgrade manual)
  ui/                 # shadcn
lib/
  opencode-db.ts      # semua query opencode (readonly)
  router-db.ts        # agregat usageDaily 9router
  live-status.ts      # rumus tunggal thinking/stuck (STUCK_MS, LIVE_ORPHAN_MS)
  types.ts            # SessionRow, TokenStats, RouterStats, ...
  overrides.ts assign-names.ts nordic-names.ts dashboard-filter.ts
data/web-overrides.json  # aliases/hidden/workflow (persist)
```

## Polling & Cache

| Data | Interval | Alasan |
|---|---|---|
| `/api/sessions` di `/` | 1.5s | butuh near-realtime untuk thinking/stuck |
| `/api/sessions` di `/sessions` | 1s | kanban + inspector live |
| `/api/tokens` | 60s + cache server 45s | full-scan `message`, berat untuk poll cepat |
| `/api/router` | 60s + cache server 45s | `usageDaily` hanya berubah saat 9router tutup hari |
| label umur (`Xm lalu`) | 10s tick lokal | tanpa fetch |

## Logika Status Live

```
ada part running ATAU turn streaming terbuka → thinking
  └─ umur fase aktif > ambang → failed (stuck)
      ├─ part running: 5 mnt (STUCK_MS, dari time_updated heartbeat)
      └─ turn saja: 15 mnt (LIVE_ORPHAN_MS, dari liveSince time_created)
tanpa sinyal → ikut workflow override (thinking/done) → default idle
```

Umur fase aktif (`activeForMs`): part running → `now - time_updated`; turn saja → `now - liveSince`; tanpa sinyal → umur sesi. `time_updated` beku saat model berpikir, jadi turn tanpa tool wajib diukur dari `liveSince`.

## Keterbatasan

- **Cost per sesi opencode mustahil** — `usageHistory.meta` kosong di 82rb baris, tanpa session-id; butuh join time-window = tebakan. Satu-satunya sumber cost = agregat 9router semua-client.
- **`message.cost` opencode selalu 0** — jangan pakai untuk biaya.
- **Latency request** hanya di `requestDetails` yang beku sejak 2026-08-09; API 9router butuh JWT (401 untuk apiKey).
- **Zona waktu** — `dateKey` 9router = tanggal lokal mesinnya; jangan konversi via `toISOString()` (geser 1 hari di WIB).

## Tech Stack

Next.js 16 · React 19 · Tailwind CSS 4 · shadcn/ui (Radix) · Recharts (KPI/sparkline) · ECharts via EvilCharts (tren router) · ReactFlow + dagre (graph) · TanStack Table (tabel sortable) · better-sqlite3 · next-themes · lucide-react · sonner.
