// Rumus status live — SATU sumber tunggal yang dipakai bersama oleh
// app/api/sessions/route.ts, components/dashboard/sessions-kanban/types.ts,
// dan app/page.tsx. Kalau rumus ini diubah, ketiga layar berubah bersamaan.
//
// Dua sumber sinyal, dua ambang:
// - `activeMap`: ada part tool dengan state running (butuh tool call).
// - `live`:     turn assistant yang belum punya `$.time.completed`, ditulis
//               model yang sedang streaming teks tanpa tool call. Sinyal ini
//  satu-satunya yang bisa mendeteksi sesi yang TIDAK memakai sub agent.

// Part running: fail-open (lihat getActiveChildren) supaya tool lambat tidak
// ditandai gagal. 5 menit = jauh di atas durasi tool terpanjang normal.
export const STUCK_MS = 5 * 60 * 1000;

// Turn streaming tanpa tool punya ambang sendiri: jauh lebih foraging dari
// part running, karena satu turn mikir yang panjang (model lambat, konteks
// besar) tetap sehat. 15 menit = jauh di atas durasi thinking terpanjang
// yang terukur (p99 normal < 2 menit). Tanpa cap ini, turn yang crash
// (proses dibunuh sebelum `time.completed` ditulis) akan menggantung
// selamanya sebagai "thinking".
export const LIVE_ORPHAN_MS = 15 * 60 * 1000;

/** Epoch ms, toleran terhadap detik (10 digit) maupun ms (13 digit). */
export function toMs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

/**
 * Umur fase AKTIF sebuah sesi — bukan umur sesi.
 * `time_updated` beku selama model berpikir (tidak ada heartbeat), jadi
 * memakai `time_updated` untuk turn tanpa tool akan salah jadi stuck.
 * - ada part running → `time_updated` (maju tiap heartbeat),
 * - turn streaming saja → `liveSince` (time_created turn),
 * - tidak ada sinyal sama sekali → `time_updated` (fall-back ke umur sesi,
 *   bukan `now - 0` yang menghasilkan "umurpuluhan tahun").
 */
export function activeForMs(
  timeUpdated: number,
  activeCount: number,
  liveSince: number,
  now: number,
): number {
  return Math.max(
    0,
    now - (activeCount > 0 ? toMs(timeUpdated) : liveSince > 0 ? liveSince : toMs(timeUpdated)),
  );
}

/** Ambang stuck per kasus: turn streaming tanpa tool diberi waktu lebih panjang. */
export function stuckLimitMs(activeCount: number, liveSince: number): number {
  return activeCount === 0 && liveSince > 0 ? LIVE_ORPHAN_MS : STUCK_MS;
}

/** true bila fase aktif melewati ambangnya → dianggap "gagal" (chip failed / stuck). */
export function isStuck(
  timeUpdated: number,
  activeCount: number,
  liveSince: number,
  now: number,
): boolean {
  if (activeCount <= 0 && liveSince <= 0) return false;
  return activeForMs(timeUpdated, activeCount, liveSince, now) > stuckLimitMs(activeCount, liveSince);
}

/** true bila sesi sedang bekerja: ada part running ATAU ada turn streaming. */
export function isThinkingNow(activeCount: number, liveSince: number): boolean {
  return activeCount > 0 || liveSince > 0;
}
