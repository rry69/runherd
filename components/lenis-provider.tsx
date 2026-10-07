'use client';

import Lenis from 'lenis';
import { useEffect, type ReactNode } from 'react';

const DISABLED = process.env.NEXT_PUBLIC_LENIS === 'off';

export function LenisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (DISABLED || document.documentElement.dataset.lenis === 'off') return;

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
    });

    let animationFrameId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      animationFrameId = window.requestAnimationFrame(raf);
    };

    animationFrameId = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      lenis.destroy();
    };
  }, []);

  return children;
}
