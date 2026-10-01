"use client";

// HashLoader resmi (react-spinners) untuk semua indikator "thinking".
//
// Dua batasan library yang mengikat di sini:
// 1. `color` hanya menerima hex. Nilainya masuk ke teks @keyframes lewat
//    calculateRgba yang parseInt tanpa fallback, jadi currentColor/var(--x)
//    jadi rgba(NaN,...) dan box-shadow di-drop. Karena itu warna diambil dari
//    resolvedTheme lewat peta di bawah, bukan CSS var.
//    -> nilai hex ini harus sama dengan --primary di app/globals.css.
// 2. HashLoader tidak punya memo; tiap render membuat 2 <style> di <head>.
//    Di sini kanban re-render tiap 1 detik (POLL_MS), jadi memo wajib.
//
// `color` tidak pernah masuk markup (cuma keyframes yang di-inject client-side),
// jadi render SSR tetap identik: tanpa hydration mismatch.

import { memo } from "react";
import { HashLoader } from "react-spinners";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

// Cerminan --primary per tema di app/globals.css.
const PRIMARY: Record<string, string> = {
  dark: "#ede9f5",
  light: "#059669",
};

function ThinkingSpinnerBase({ size = 14 }: { size?: number }) {
  const { resolvedTheme } = useTheme();

  return (
    <HashLoader
      aria-hidden="true"
      color={PRIMARY[resolvedTheme ?? "dark"] ?? PRIMARY.dark}
      size={size}
      className="thinking-hash shrink-0"
    />
  );
}

// Render ulang tiap tick polling akan menambah <style> ke <head> tanpa batas
// (2 per render per instance), dan HashLoader tidak bail out sendiri.
export const ThinkingSpinner = memo(ThinkingSpinnerBase);