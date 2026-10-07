"use client";

import * as React from "react";
import { LINEAR_THEMES, isDarkHex } from "@/lib/linear-themes";

function isHex(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
}

/** Resolve `color-mix(in srgb, A p%, B)` → hex. Format lain → null. */
function resolveColorMix(raw: string): string | null {
  const m = raw.match(
    /color-mix\(in srgb,\s*(#[0-9a-f]{3,6})\s+([\d.]+)%\s*,\s*(#[0-9a-f]{3,6})/i,
  );
  if (!m) return null;
  const [, a, pStr, b] = m;
  const p = Math.min(1, Math.max(0, parseFloat(pStr) / 100));
  const rgb = (h: string): [number, number, number] => {
    const v = h.replace("#", "");
    const f = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  };
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v * p + B[i] * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}

function readIsLight(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  // 1) color-scheme selalu diset applyLinearTheme dari bg — sinyal paling andal.
  // (Inline --card adalah color-mix() yang gagal diparse isDarkHex → false
  // positive "light" di tema dark = label hitam di atas kartu gelap.)
  const scheme = (
    root.style.getPropertyValue("color-scheme").trim() ||
    root.style.colorScheme?.trim() ||
    ""
  ).toLowerCase();
  if (scheme === "light") return true;
  if (scheme === "dark") return false;
  // 2) dataset tema → lookup bg asli (hindari parse color-mix sama sekali).
  const name = root.dataset.linearTheme;
  if (name) {
    const th = LINEAR_THEMES.find((t) => t.name === name);
    if (th) return !isDarkHex(th.bg);
  }
  // 3) permukaan --card (hex langsung atau color-mix).
  const surface =
    root.style.getPropertyValue("--card").trim() ||
    root.style.getPropertyValue("--background").trim();
  if (surface) {
    if (isHex(surface)) return !isDarkHex(surface);
    const resolved = resolveColorMix(surface);
    if (resolved) return !isDarkHex(resolved);
  }
  // 4) fallback class next-themes.
  if (root.classList.contains("light")) return true;
  if (root.classList.contains("dark")) return false;
  return false;
}

function subscribe(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style", "class", "data-linear-theme"],
  });
  return () => obs.disconnect();
}

/** Light/dark aktual permukaan — hormati tema custom linear.style (inline --background + colorScheme). */
export function useIsLightSurface(): boolean {
  return React.useSyncExternalStore(subscribe, readIsLight, () => false);
}
