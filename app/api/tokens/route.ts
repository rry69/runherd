import { getTokenStats } from "@/lib/opencode-db";
import type { TokenStats } from "@/lib/types";

export const dynamic = "force-dynamic";

// Endpoint TERPISAH dari /api/sessions (yang di-poll tiap 1.5s):
// agregat full-scan message (~5.7k baris) terlalu berat untuk poll cepat.
// Cache in-memory 45s — DB hanya berubah saat ada turn assistant baru.
// Fail-open: DB gagal → ok:false agar klien sticky (tidak menimpa angka lama).
const TTL_MS = 45_000;
let cached: { at: number; stats: TokenStats } | null = null;

export async function GET() {
  try {
    const now = Date.now();
    if (cached && now - cached.at < TTL_MS) {
      return Response.json(
        { ok: true, tokens: cached.stats },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const stats = getTokenStats();
    if (!stats) {
      return Response.json(
        { ok: false, error: "gagal membaca DB" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
    cached = { at: now, stats };
    return Response.json(
      { ok: true, tokens: stats },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, error: "gagal membaca DB" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
