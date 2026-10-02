import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Angka PENUH — tidak ada pembulatan, tidak ada pemangkasan digit.
// Dipakai halaman /router (data 9router) karena request eksplisit: jangan ada
// angka yang dikurangi. `maximumFractionDigits: 20` mencegah `toLocaleString`
// memangkas ekor float — cost 9router adalah REAL hasil penjumlahan, contoh
// riil `10.661776235799996` yang jadi `10,66` bila di-`toFixed(2)`; 9 dari 31
// hari berbiaya 0 sementara sisanya melonjak, jadi informasi yang hilang justru
// yang paling penting.
// locale id-ID: desimal koma, ribuan titik (konsisten dengan sisa halaman).
export function fullNum(n: number, fraction = 20): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("id-ID", { maximumFractionDigits: fraction });
}

// Pecah "10,661776235799996" → { head: "10,", tail: "661776235799996" }.
// Head = bagian bulat (besar), tail = pecahan (kecil, redup). Tujuannya
// hierarki visual untuk nilai 18 digit, BUKAN menyembunyikan digit: seluruh
// karakter tetap dirender, hanya ukurannya dibedakan.
export function splitNum(s: string): { head: string; tail: string } {
  const i = s.search(/[.,]/);
  if (i < 0) return { head: s, tail: "" };
  return { head: s.slice(0, i + 1), tail: s.slice(i + 1) };
}