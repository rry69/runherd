"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { SessionRow } from "@/lib/types";

// Durasi sinkron dengan CSS popup-out (280ms) — ubah keduanya bersamaan.
const EXIT_MS = 280;

export function ActiveSessionsPopup({ items }: { items: SessionRow[] }) {
  const idsKey = React.useMemo(() => items.map((i) => i.id).join(","), [items]);
  // Simpan kunci ID saat ditutup: popup sembunyi sampai ada ID running baru.
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);
  // display = item yang tampil (dipertahankan saat exit agar sempat animasi).
  const [display, setDisplay] = React.useState<SessionRow[] | null>(null);
  const [leaving, setLeaving] = React.useState(false);
  const displayKey = React.useMemo(
    () => (display ?? []).map((i) => i.id).join(","),
    [display],
  );

  const shouldShow = items.length > 0 && dismissedKey !== idsKey;

  // Adjust state saat render (pola derived-state resmi React, bukan effect):
  // masuk → segarkan display; hilang → tandai leaving, DOM dipertahankan.
  if (shouldShow) {
    if (leaving || display === null || displayKey !== idsKey) {
      setDisplay(items);
      if (leaving) setLeaving(false);
    }
  } else if (display !== null && !leaving) {
    setLeaving(true);
  }

  // Ref node popup: exit dijalankan via WAAPI (tak tergantung restart CSS).
  const nodeRef = React.useRef<HTMLDivElement | null>(null);

  // Satu-satunya effect: jalankan exit via WAAPI + timer pelepas DOM.
  // setState di dalam callback async (bukan sinkron) → lolos lint.
  React.useEffect(() => {
    if (!leaving) return;
    const node = nodeRef.current;
    let anim: Animation | undefined;
    try {
      // WAAPI menimpa CSS selama berjalan; CSS popup-exit jadi fallback
      // bila WAAPI gagal. Reduced-motion: skip, langsung lepas DOM.
      if (
        node?.animate &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        anim = node.animate(
          [
            { opacity: "1", transform: "none" },
            { opacity: "0", transform: "translateY(-8px) scale(.97)" },
          ],
          { duration: EXIT_MS, easing: "ease-in", fill: "forwards" },
        );
      }
    } catch {
      /* fallback CSS popup-exit tetap jalan */
    }
    const t = setTimeout(() => {
      setDisplay(null);
      setLeaving(false);
    }, EXIT_MS);
    return () => {
      clearTimeout(t);
      try {
        anim?.cancel();
      } catch {
        /* abaikan */
      }
    };
  }, [leaving]);

  // Portal ke body: lepas dari ancestor PageTransition yang punya
  // `will-change: transform` (menjadikan fixed ikut scroll).
  // Guard SSR setelah hooks (hooks wajib unconditional).
  if (typeof document === "undefined" || display === null) return null;
  const shown = display.slice(0, 5);
  const rest = display.length - shown.length;

  return createPortal(
    <>
      <style>{`@keyframes popup-spin{to{transform:rotate(360deg)}}@keyframes popup-in{from{opacity:0;transform:translateY(-12px) scale(.96)}to{opacity:1;transform:none}}@keyframes popup-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-8px) scale(.97)}}.popup-enter{animation:popup-in 450ms cubic-bezier(0.22,1,0.36,1) both;will-change:opacity,transform}.popup-exit{animation:popup-out ${EXIT_MS}ms ease-in both;will-change:opacity,transform}@media (prefers-reduced-motion:reduce){.popup-enter,.popup-exit{animation:none}}`}</style>
    <div
      ref={nodeRef}
      role="status"
      aria-live="polite"
      // Ganti class (bukan inline animation-name) agar restart animation
      // andal + media query reduced-motion bisa override (inline tak bisa).
      // Easing enter sama keluarga Lenis/page-transition (0.22,1,0.36,1).
      className={`fixed right-4 top-4 z-40 w-[320px] ${leaving ? "popup-exit" : "popup-enter"}`}
    >
    <div className="relative overflow-hidden rounded-lg p-px">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[-60%] motion-safe:animate-[popup-spin_4s_linear_infinite]"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0 72%, rgba(16,185,129,0.9) 88%, transparent 100%)",
        }}
      />
      <div className="relative rounded-[7px] bg-card p-4 shadow-lg">
      <p className="text-sm font-semibold">
        {display.length} sesi running
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {shown.map((s) => (
          <li key={s.id} className="truncate text-xs text-muted-foreground">
            <Link
              href={`/sessions?sel=${encodeURIComponent(s.id)}`}
              className="hover:underline"
            >
              <span className="font-medium text-foreground">{s.title || s.id.slice(0, 8)}</span>
              {" · "}
              {s.agent || "unknown"}
            </Link>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">+{rest} lainnya</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Link
          href="/sessions"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Lihat Sessions
        </Link>
        <button
          type="button"
          onClick={() => setDismissedKey(idsKey)}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
        >
          Tutup
        </button>
      </div>
      </div>
    </div>
    </div>
    </>,
    document.body,
  );
}
