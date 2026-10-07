"use client";

// Loader full-page resmi (QuarterRing loading-ui.com).
// Overlay di-portal ke document.body: PageTransition
// (.page-transition, will-change + animasi translateY) membuat
// stacking context sehingga `fixed` terjebak di dalam <main>;
// portal memastikan overlay menutup sidebar juga.
// Render non-portal saat SSR/pre-mount agar hydration cocok,
// lalu pindah ke portal setelah mount.
//
// Warna via currentColor (text-white di overlay gelap), jadi
// aman untuk tema apa pun tanpa peta hex per-tema.
//
// Kelas `quarter-ring` memakai guard reduced-motion yang
// sudah ada di app/globals.css.
//
// QuarterRing tidak inject <style> per render (keyframes di
// globals.css), tapi memo tetap dipakai agar fade visible
// tidak render ulang tanpa perlu.

import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { QuarterRing } from "@/components/loading-ui/quarter-ring";

function FullPageLoaderBase({ visible = true }: { visible?: boolean }) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [shouldRender, setShouldRender] = useState(visible);
  const [isOpaque, setIsOpaque] = useState(false);

  useEffect(() => {
    if (visible) {
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        setShouldRender(true);
        setIsOpaque(false);
        raf2 = requestAnimationFrame(() => setIsOpaque(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    const raf = requestAnimationFrame(() => setIsOpaque(false));
    const t = setTimeout(() => setShouldRender(false), 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [visible]);

  if (!shouldRender) return null;

  const hidden = !visible;

  const overlay = (
    <div
      role="status"
      aria-busy="true"
      aria-hidden={hidden || undefined}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${isOpaque ? "opacity-100" : "opacity-0"}${hidden ? " pointer-events-none" : ""}`}
    >
      <QuarterRing aria-hidden="true" className="size-12 text-white" />
    </div>
  );

  if (!mounted) return overlay;
  return createPortal(overlay, document.body);
}

export const FullPageLoader = memo(FullPageLoaderBase);
export default FullPageLoader;
