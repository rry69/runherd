import type { RouterStats, TokenStats } from "./types";

// Sumber hasil insight: "llm" = narasi dari model via 9router,
// "fallback" = template deterministik dari angka (tanpa LLM).
export type InsightSource = "llm" | "fallback";

// ─── Snapshot gabungan ringan (opencode + 9router) ─────────────────────────
// Sengaja agregat saja (bukan dump mentah) agar prompt tetap ~1-2KB dan
// Generate <2s di luar waktu LLM:
// - opencode: total/input/output + top-5 model + top-5 sesi + daily 7 hari
// - 9router: RouterStats apa adanya (31 baris usageDaily = ~1ms)
// Hermes sengaja dikecualikan (DB sering hilang/lock) — insight 2 sumber saja.
export type OpencodeSummary = {
  sessionsTotal: number | null;
  total: number;
  input: number;
  output: number;
  topModels: { model: string; provider: string; total: number; count: number }[];
  topSessions: { session: string; total: number }[];
  last7: { date: string; total: number }[];
};

export type UnifiedSnapshot = {
  router: RouterStats;
  opencode: OpencodeSummary | null;
};

export function buildOpencodeSummary(
  stats: TokenStats | null,
  sessionsTotal: number | null,
): OpencodeSummary | null {
  if (!stats) return null;
  return {
    sessionsTotal,
    total: stats.total ?? 0,
    input: stats.input ?? 0,
    output: stats.output ?? 0,
    topModels: (stats.byModel ?? []).slice(0, 5).map((m) => ({
      model: m.model,
      provider: m.provider,
      total: m.total ?? 0,
      count: m.count ?? 0,
    })),
    topSessions: (stats.bySession ?? []).slice(0, 5).map((s) => ({
      session: s.session,
      total: s.total ?? 0,
    })),
    last7: (stats.daily ?? []).slice(-7).map((d) => ({ date: d.date, total: d.total ?? 0 })),
  };
}

// ─── Checklist section + custom prompt (insight advance) ────────────────────
// 8 key granular hasil kesepakatan: 4 milik 9router, 4 milik opencode.
// Dipakai klien sebagai checklist + server sebagai whitelist filter DATA.
// dayCount/lastDate selalu ikut sebagai metadata jendela waktu (murah).
export type InsightSection =
  | "router.summary"
  | "router.topProviders"
  | "router.topModels"
  | "router.trend7"
  | "opencode.totals"
  | "opencode.topModels"
  | "opencode.topSessions"
  | "opencode.trend7";

export const INSIGHT_SECTIONS: { key: InsightSection; group: "9router" | "Opencode"; label: string }[] = [
  { key: "router.summary", group: "9router", label: "Ringkasan biaya" },
  { key: "router.topProviders", group: "9router", label: "Top provider" },
  { key: "router.topModels", group: "9router", label: "Top model" },
  { key: "router.trend7", group: "9router", label: "Tren 7 hari" },
  { key: "opencode.totals", group: "Opencode", label: "Total token & sesi" },
  { key: "opencode.topModels", group: "Opencode", label: "Top model" },
  { key: "opencode.topSessions", group: "Opencode", label: "Top sesi" },
  { key: "opencode.trend7", group: "Opencode", label: "Tren 7 hari" },
];

export const DEFAULT_INSIGHT_SECTIONS: InsightSection[] = INSIGHT_SECTIONS.map((s) => s.key);

// Batas prompt user agar tidak menenggelamkan guardrail (prompt ~1-2KB).
export const MAX_USER_PROMPT_CHARS = 2000;

export type UnifiedPromptOptions = {
  sections?: InsightSection[];
  userPrompt?: string;
};

function normalizeSections(sections?: InsightSection[]): Set<InsightSection> {
  const valid = new Set<InsightSection>(DEFAULT_INSIGHT_SECTIONS);
  if (!Array.isArray(sections) || sections.length === 0) return new Set(valid);
  const picked = sections.filter((s): s is InsightSection => valid.has(s));
  return picked.length > 0 ? new Set(picked) : new Set(valid);
}

function cleanUserPrompt(p?: string): string {
  if (typeof p !== "string") return "";
  return p.trim().slice(0, MAX_USER_PROMPT_CHARS);
}

// Prompt gabungan 2 sumber (opencode + 9router). Tetap ringan: agregat
// ringkas saja, prompt ~1-2KB. Instruksi max 180 kata, wajib 1 angka per
// sumber + 1 saran hemat lintas-sumber. Larang karang angka di luar data.
export function buildUnifiedPrompt(snap: UnifiedSnapshot, opts?: UnifiedPromptOptions): string {
  const r = snap.router;
  const sel = normalizeSections(opts?.sections);
  const topProviders = r.byProvider.slice(0, 5).map((p) => ({
    provider: p.key,
    cost: round2(p.cost),
    requests: p.requests,
  }));
  const topModels = r.byModel.slice(0, 5).map((m) => ({
    model: m.key,
    requests: m.requests,
    cost: round2(m.cost),
  }));
  const last7 = r.daily.slice(-7).map((d) => ({
    date: d.date,
    cost: round2(d.cost),
    requests: d.requests,
  }));
  // Susun DATA hanya dari section terpilih — yang tak dipilih jangan dikirim
  // sama sekali agar LLM tak bisa mengarang darinya.
  const router9: Record<string, unknown> = {
    dayCount: r.dayCount,
    lastDate: r.lastDate,
  };
  if (sel.has("router.summary")) {
    Object.assign(router9, {
      cost: round2(r.cost),
      requests: r.requests,
      totalTokens: r.totalTokens,
      cacheHit: round2(r.cacheHit),
      costPerDay: round2(r.costPerDay),
      billableDays: r.billableDays,
      todayCost: round2(r.todayCost),
    });
  }
  if (sel.has("router.topProviders")) router9.topProviders = topProviders;
  if (sel.has("router.topModels")) router9.topModels = topModels;
  if (sel.has("router.trend7")) router9.last7days = last7;
  const op = snap.opencode;
  let opencode: Record<string, unknown> | null = null;
  if (op) {
    opencode = {};
    if (sel.has("opencode.totals")) {
      Object.assign(opencode, {
        sessionsTotal: op.sessionsTotal,
        total: op.total,
        input: op.input,
        output: op.output,
      });
    }
    if (sel.has("opencode.topModels")) opencode.topModels = op.topModels;
    if (sel.has("opencode.topSessions")) opencode.topSessions = op.topSessions;
    if (sel.has("opencode.trend7")) opencode.last7 = op.last7;
    if (Object.keys(opencode).length === 0) opencode = null;
  }
  const data = { router9, opencode };
  const focus = cleanUserPrompt(opts?.userPrompt);
  return [
    "Kamu analis biaya & pemakaian LLM. Tulis ringkasan naratif Bahasa Indonesia, maksimal 180 kata, dari data gabungan opencode + 9router berikut. Catatan jendela waktu: angka 9router = periode `dayCount` hari terakhir; angka opencode = SEMUA waktu (all-time) kecuali daily 7 hari — jangan bandingkan langsung sebagai periode yang sama.",
    "Wajib sebutkan: SATU angka biaya 9router, SATU angka token opencode, provider/model dominan, dan SATU saran hemat konkret lintas-sumber — tetapi HANYA dari bagian DATA yang tersedia; bagian yang tidak dipilih berarti tidak tersedia, sebutkan jujur bila diminta dan jangan karang angkanya.",
    "Sumber yang null berarti DB-nya gagal dibaca — sebutkan jujur sumber itu tidak tersedia, jangan karang angkanya. Dilarang mengarang angka di luar data. Tidak ada markdown heading; satu paragraf pembuka + maksimal 3 bullet dengan tanda '-'.",
    ...(focus !== "" ? [`FOKUS USER: ${focus}`, "Utamakan menjawab fokus user di atas dalam batas kontrak format."] : []),
    `DATA: ${JSON.stringify(data)}`,
  ].join("\n");
}

// Kompat lama: prompt 9router saja (dipakai bila DB lokal gagal).
export function buildInsightPrompt(stats: RouterStats): string {
  return buildUnifiedPrompt({ router: stats, opencode: null });
}

// Fallback gabungan 2 kalimat (satu per sumber) + catatan sumber yang
// hilang. Murni format angka yang sudah ada — tidak ada klaim baru.
// Menghormati sections: bagian yang tak dipilih tidak ditampilkan.
export function buildUnifiedFallback(snap: UnifiedSnapshot, sections?: InsightSection[]): string {
  const sel = normalizeSections(sections);
  const r = snap.router;
  const routerPart =
    `9router: biaya $${fmtMoney(r.cost)} dari ${fmtInt(r.requests)} request ` +
    `(${fmtInt(r.totalTokens)} token) dalam ${r.dayCount} hari (s/d ${r.lastDate}); ` +
    `rata-rata $${fmtMoney(r.costPerDay)}/hari, cache-hit ${fmtMoney(r.cacheHit)}%.`;
  const op = snap.opencode;
  const wantRouter = sel.has("router.summary");
  const wantOpencode =
    sel.has("opencode.totals") ||
    sel.has("opencode.topModels") ||
    sel.has("opencode.topSessions") ||
    sel.has("opencode.trend7");
  const parts: string[] = [];
  if (wantRouter) parts.push(routerPart);
  if (wantOpencode) {
    const opencodePart = op
      ? `Opencode: ${op.sessionsTotal != null ? fmtInt(op.sessionsTotal) : "?"} sesi, ` +
        `${fmtInt(op.total)} token (in ${fmtInt(op.input)} / out ${fmtInt(op.output)})` +
        (sel.has("opencode.topModels") && op.topModels[0]
          ? `, model dominan ${op.topModels[0].model} (${fmtInt(op.topModels[0].total)} token)`
          : "") +
        "."
      : "Opencode: DB gagal dibaca — angka sesi/token tidak tersedia.";
    parts.push(opencodePart);
  }
  return parts.length > 0 ? parts.join(" ") : "Tidak ada bagian data yang dipilih.";
}

// Kompat lama: fallback 9router saja.
export function buildFallbackInsight(stats: RouterStats): string {
  return buildUnifiedFallback({ router: stats, opencode: null });
}

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("id-ID");
}
