export type SessionRow = {
  id: string;
  parent_id: string | null;
  directory: string;
  title: string;
  agent: string;
  time_updated: number;
  source?: string;
};

export type SessionStatus = "thinking" | "idle";

export type SessionNodeData = {
  label: string;
  agent: string;
  title: string;
  status: SessionStatus;
  directory: string;
};

export type ActiveChild = {
  sessionId: string;
  parentId: string;
  agent: string;
  title: string;
  partType: string;
  tool: string | null;
  tokens: number;
  updatedAt: number;
  ageMs: number;
};

export type SessionLiveStatus = "thinking" | "queued" | "failed" | "idle" | "done";

export type SessionLiveWf = "thinking" | "done";

// Sesi top-level yang sedang streaming tanpa tool: root session id →
// time_created (ms) turn assistant yang belum punya `$.time.completed`.
// 0 / tidak ada = tidak ada turn terbuka. Field hilang = DB error, klien
// pertahankan status terakhir (fail-open, bukan auto-idle).
export type LiveMap = Record<string, number>;

// Riwayat task subagent dari part `tool=task`.
// durationMs null = masih running (state.time.end belum ada).
// Kontrak jujur 100% real dari DB (tabel part):
// - title: $.state.title ?? $.state.input.description (fallback description)
// - report: $.state.output (string besar, bisa null bila running/error-cancel)
// - errorText: $.state.error (string, null bila tidak error)
// - truncated: $.state.metadata.truncated == 1 (null/missing → false)
// - tools: daftar tool unik milik child session (dari getChildTools, fail-open [])
// - tokens: total token child session (dari getChildTokens, fail-open null)
export type SubagentTask = {
  childSessionId: string | null;
  parentSessionId: string | null;
  agent: string;
  description: string;
  status: "running" | "completed" | "error";
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  // Field kontrak jujur 100% real dari DB (produsen: getTaskHistory + route
  // enrichment; konsumen: Inspector). Wajib diisi produsen; mock statis wajib
  // ikut mengisi agar tsc hijau.
  title: string;
  report: string | null;
  errorText: string | null;
  truncated: boolean;
  tools: string[];
  tokens: number | null;
};

export type SessionLive = {
  row: SessionRow;
  status: SessionLiveStatus;
  wf: SessionLiveWf;
  ageMs: number;
  tool: string | null;
  partType: string;
  tokens: number;
  breakdown: [number, number, number];
};

export type ToolEvent = {
  sessionId: string;
  tool: string;
  status: "running" | "completed" | "error";
  at: number;
  filePath: string | null;
  // Ringkasan input tool (command/pattern/description/url) supaya baris
  // timeline tidak kosong untuk tool tanpa filePath. Fallback: filePath.
  detail: string | null;
  // Durasi eksekusi ms; null bila tool belum selesai.
  durationMs: number | null;
  origin: "main" | "sub";
  agent: string;
};

export type ChangedFile = {
  file: string;
  added: number;
  deleted: number;
  source: "filediff" | "write" | "patch-list";
};

// Agregat token global dari tabel `message` (role=assistant, HANYA
// providerID='opencode' = model bawaan). Sumber tunggal — JANGAN campur dengan
// part step-finish (duplikat angka), JANGAN sertakan provider lain (9router).
// Fail-open: DB gagal → null, field API dihilangkan agar klien sticky.
export type TokenDaily = {
  date: string;
  total: number;
  input: number;
  output: number;
};

export type TokenByModel = {
  model: string;
  provider: string;
  count: number;
  total: number;
};

export type SessionModel = {
  model: string;
  provider: string;
  at: number;
};

export type SessionModelTokens = {
  model: string;
  provider: string;
  total: number;
  input: number;
  output: number;
};

export type TokenStats = {
  total: number;
  input: number;
  output: number;
  daily: TokenDaily[];
  byModel: TokenByModel[];
  // Total per sesi ROOT (subtree subagent di-roll-up ke root via parent_id).
  // Sumber sama: message role=assistant. Hanya root yang punya pesan.
  bySession: TokenSession[];
};

// Total token satu sesi root (termasuk seluruh subagent di bawahnya).
// Absen dari array = sesi tanpa pesan assistant (bukan 0) → klien sembunyikan.
export type TokenSession = {
  session: string;
  total: number;
  input: number;
  output: number;
  // Breakdown assistant-message per model/provider; provider apa pun.
  models?: SessionModelTokens[];
};

// ─── 9router (halaman /router) ────────────────────────────────────────────
// Sumber: tabel `usageDaily` di C:\Users\Hrry\AppData\Roaming\9router\db\
// data.sqlite — satu baris per hari, kolom `data` berisi JSON yang SUDAH
// teragregat (requests/promptTokens/completionTokens/cachedTokens/cost plus
// byProvider/byModel/byApiKey/byEndpoint). Tidak ada scan tabel besar: 31
// baris = ~1ms, aman poll 60s.
// opencode.db TIDAK bisa dipakai untuk biaya: `message.cost` selalu 0, dan
// `usageHistory` tidak mencatat session-id sehingga biaya per sesi opencode
// tidak bisa ditelusuri (meta kosong di 82rb baris).

// Satu hari. `date` = dateKey 9router (YYYY-MM-DD, waktu lokal tempat 9router
// menulis — bukan konversi UTC, supaya cocok dengan baris aslinya).
export type RouterDaily = {
  date: string;
  cost: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
};

// Baris breakdown per provider / per model untuk satu periode.
// `key` = nama provider, atau `model|provider` untuk byModel (format key yang
// dipakai 9router). `cacheHit` 0..1; 0 bila promptTokens nol (undefined, bukan
// NaN) supaya UI tidak menampilkan "NaN%".
export type RouterBreakdown = {
  key: string;
  requests: number;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheHit: number;
  // Biaya per 1000 request. Dua provider dengan request sama bisa beda biaya
  // 100x (openai-compatible-chat-fd9c2dcb: 44.216 req cost 0 vs codebuddy-cn:
  // 276 req cost 7.24) — metrik ini yang bikin bedanya kelihatan.
  costPer1k: number;
};

// Agregat satu periode (default 30 hari) + turunan untuk KPI.
// Semua field WAJIB (tanpa `?`): bila DB gagal, `getRouterStats` mengembalikan
// null dan route menghapus field `router` dari payload agar klien mempertahankan
// angka terakhir — bukan menampilkan 0 palsu.
export type RouterStats = {
  // Jumlah hari yang BENAR-BENAR ada barisnya, bukan `days` yang diminta:
  // 9router menyimpan 88 hari historis, jadi `days`=30 bisa menghasilkan 31
  // baris (inklusif) atau 29 kalau ada gap. Pembagi rata-rata memakai jumlah
  // baris nyata agar "rata-rata per hari" tidak bias.
  dayCount: number;
  cost: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  // cachedTokens / promptTokens dalam persen (0..100), 0 bila promptTokens 0.
  cacheHit: number;
  costPerDay: number;
  requestsPerDay: number;
  costPer1k: number;
  totalTokens: number;
  // Hari terakhir di data (bukan `new Date()`): kalau 9router berhenti menulis,
  // "today" harus menunjuk hari terakhir yang ADA, bukan hari kalender kosong.
  lastDate: string;
  todayCost: number;
  todayRequests: number;
  // Berapa dari `dayCount` hari yang punya cost > 0. 9 dari 31 pada periode
  // 30 hari — tanpa ini user mengira tren yang rata itu rusak.
  billableDays: number;
  daily: RouterDaily[];
  byProvider: RouterBreakdown[];
  byModel: RouterBreakdown[];
  // Attribution tambahan: byApiKey (key di-mask server, format `sk-…xxxx|model|provider`)
  // + byEndpoint (`endpoint|model|provider`). Kosong [] bila DB lama tak punya key-nya.
  byApiKey: RouterBreakdown[];
  byEndpoint: RouterBreakdown[];
};
