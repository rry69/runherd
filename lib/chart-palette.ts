"use client";

import * as React from "react";
import { useIsLightSurface } from "@/hooks/use-is-light-surface";

function cssRaw(name: string): string {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  return (
    root.style.getPropertyValue(name).trim() ||
    getComputedStyle(root).getPropertyValue(name).trim()
  );
}

/** Parse #hex / rgb() / rgba() → hex. oklch mentah → null (pakai fallback). */
function toHex(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(s)) {
    const v = s.slice(1);
    const f = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
    return `#${f}`;
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Math.round(parseFloat(v)))));
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

function mixHex(a: string, b: string, p: number): string {
  const rgb = (h: string): [number, number, number] => {
    const v = h.replace("#", "");
    const f = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  };
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v * (1 - p) + B[i] * p).toString(16).padStart(2, "0")).join("")}`;
}

function readAccent(fallbackFg: string): { accent: string; fg: string } {
  const accent = toHex(cssRaw("--primary")) ?? "#5e6ad2";
  const fg = toHex(cssRaw("--card-foreground")) ?? toHex(cssRaw("--foreground")) ?? fallbackFg;
  return { accent, fg: fg ?? fallbackFg };
}

/** Accent tema aktif (--primary). Berubah tiap ganti tema → trigger remount chart. */
export function useAccent(): string {
  const isLight = useIsLightSurface();
  const fallbackFg = isLight ? "#18181b" : "#e7e7e9";
  const [accent, setAccent] = React.useState(() => (typeof document === "undefined" ? "#5e6ad2" : readAccent(fallbackFg).accent));
  React.useEffect(() => {
    const update = () => setAccent(readAccent(fallbackFg).accent);
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-linear-theme", "class"] });
    return () => obs.disconnect();
  }, [fallbackFg]);
  return accent;
}

/**
 * Palet flat turunan aksen: slice-0 = aksen murni, sisanya mix progresif
 * ke warna teks (fg) maks 55%. Satu hue family, tetap beda tiap kategori.
 * ponytail: n > 8 warna ujung menyatu ke fg — tambah rotasi hue bila perlu.
 */
export function useChartPalette(n: number): string[] {
  const isLight = useIsLightSurface();
  const fallbackFg = isLight ? "#18181b" : "#e7e7e9";
  const accent = useAccent();
  return React.useMemo(() => {
    const count = Math.max(1, n);
    const fg = toHex(typeof document === "undefined" ? "" : cssRaw("--card-foreground")) ?? fallbackFg;
    if (count === 1) return [accent];
    return Array.from({ length: count }, (_, i) => mixHex(accent, fg, (i / (count - 1)) * 0.55));
  }, [accent, fallbackFg, n]);
}
