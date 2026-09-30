'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { buttonVariants } from '@/components/animate-ui/components/buttons/icon';
import { cn } from '@/lib/utils';

const OFF = process.env.NEXT_PUBLIC_THEME_TOGGLE === 'off';
const FADE_MS = 300;

function snapshotBg(): string {
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') return bodyBg;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
  return v || bodyBg || '#000000';
}

function delay(ms: number, timeoutRef: React.MutableRefObject<number>) {
  return new Promise<void>((resolve) => {
    timeoutRef.current = window.setTimeout(resolve, ms);
  });
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayBg, setOverlayBg] = useState<string>('#000000');
  const isAnimating = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const mountedRef = useRef(true);
  const timeoutRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      overlayRef.current?.getAnimations().forEach((a) => a.cancel());
      iconRef.current?.getAnimations().forEach((a) => a.cancel());
    };
  }, []);

  // Animasi ikon sederhana via WAAPI (kebal disableTransitionOnChange).
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    iconRef.current?.animate(
      [
        { transform: 'rotate(-90deg) scale(0.6)', opacity: '0' },
        { transform: 'rotate(0deg) scale(1)', opacity: '1' },
      ],
      { duration: 250, easing: 'ease-out' },
    );
  }, [resolvedTheme]);

  const handleClick = useCallback(async () => {
    if (isAnimating.current) return;
    const next = resolvedTheme === 'light' ? 'dark' : 'light';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTheme(next);
      return;
    }
    isAnimating.current = true;
    setOverlayBg(snapshotBg());
    setShowOverlay(true);

    // Tunggu commit + paint agar overlayRef terisi.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    if (!mountedRef.current) return;

    try {
      const el = overlayRef.current;
      if (el) {
        try {
          const animIn = el.animate([{ opacity: '0' }, { opacity: '1' }], {
            duration: FADE_MS,
            easing: 'ease-out',
            fill: 'forwards',
          });
          await Promise.race([animIn.finished.catch(() => {}), delay(FADE_MS + 50, timeoutRef)]);
        } catch {
          await delay(FADE_MS, timeoutRef);
        }
      } else {
        await delay(FADE_MS, timeoutRef);
      }
      if (!mountedRef.current) return;

      setTheme(next);

      const el2 = overlayRef.current;
      if (el2) {
        try {
          const animOut = el2.animate([{ opacity: '1' }, { opacity: '0' }], {
            duration: FADE_MS,
            easing: 'ease-out',
            fill: 'forwards',
          });
          await Promise.race([animOut.finished.catch(() => {}), delay(FADE_MS + 50, timeoutRef)]);
        } catch {
          await delay(FADE_MS, timeoutRef);
        }
      } else {
        await delay(FADE_MS, timeoutRef);
      }
    } finally {
      if (mountedRef.current) setShowOverlay(false);
      isAnimating.current = false;
    }
  }, [resolvedTheme, setTheme]);

  if (OFF) return null;

  return (
    <>
      <button
        data-slot="theme-toggler-button"
        type="button"
        aria-label="Ganti tema terang/gelap"
        title="Ganti tema"
        aria-pressed={resolvedTheme === 'dark'}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        onClick={handleClick}
      >
        <span key={resolvedTheme} ref={iconRef} className="inline-flex">
          {resolvedTheme === 'dark' ? <Moon /> : <Sun />}
        </span>
      </button>
      {showOverlay &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={overlayRef}
            aria-hidden
            style={{ backgroundColor: overlayBg, opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[100]"
          />,
          document.body,
        )}
    </>
  );
}
