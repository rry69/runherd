import { getRouterStats } from "@/lib/router-db";
import type { RouterStats } from "@/lib/types";

export const dynamic = "force-dynamic";

// Endpoint TERPISAH dari /api/sessions (yang poll 1.5s) supaya lifecycle-nya
// tidak bercampur: sesi butuh cepat dan sering, angka 9router cukup poll
// 60s.
//
// TTL 45s in-memory. Catatan jujur soal angka: TIDAK ada cache yang membuat
// ini "cukup fresh" - `usageDaily` berisi satu baris per HARI, jadi angka hari
// ini hanya ikut berubah ketika 9router menutup hari (atau menambah key
// tanggal baru). TTL 45s ini murni mencegah beberapa tab yang membuka
// /router bersamaan membakar query berulang, bukan membuat data lebih baru.
// Fail-open: DB hilang / terkunci / upgrade 9router ganti skema -> ok:false,
// klien mempertahankan angka terakhir (tidak menampilkan 0 palsu).
const TTL_MS = 45_000;
let cached: { at: number; stats: RouterStats } | null = null;

// Periode 30 hari. 9router menyimpan 88 hari historis; 30 cukup untuk
// melihat pola mingguan tanpa chart yang tak terbaca.
// ponytail: satu konstanta. Tambahkan pilihan 7/30/90 hanya kalau user
// benar-benar sering berganti periode.
const WINDOW_DAYS = 30;

export async function GET() {
  const noStore = { "Cache-Control": "no-store" };
  try {
    const now = Date.now();
    if (cached && now - cached.at < TTL_MS) {
      return Response.json({ ok: true, router: cached.stats }, { headers: noStore });
    }
    const stats = getRouterStats(WINDOW_DAYS);
    if (!stats) {
      return Response.json(
        { ok: false, error: "gagal membaca DB 9router" },
        { status: 500, headers: noStore },
      );
    }
    cached = { at: now, stats };
    return Response.json({ ok: true, router: stats }, { headers: noStore });
  } catch {
    return Response.json(
      { ok: false, error: "gagal membaca DB 9router" },
      { status: 500, headers: noStore },
    );
  }
}