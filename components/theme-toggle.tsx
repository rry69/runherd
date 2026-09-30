'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { buttonVariants } from '@/components/animate-ui/components/buttons/icon';
import { cn } from '@/lib/utils';

const OFF = process.env.NEXT_PUBLIC_THEME_TOGGLE === 'off';
const FADE_MS = 300;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [showOverlay, setShowOverlay] = useState(false);
  const [opaque, setOpaque] = useState(false);
  const timers = useRef<number[]>([]);
  const raf = useRef(0);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const handleClick = useCallback(() => {
    const next = resolvedTheme === 'light' ? 'dark' : 'light';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTheme(next);
      return;
    }
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (raf.current) cancelAnimationFrame(raf.current);
    setShowOverlay(true);
    setOpaque(false);
    raf.current = requestAnimationFrame(() => {
      raf.current = requestAnimationFrame(() => setOpaque(true));
    });
    timers.current.push(
      window.setTimeout(() => {
        setTheme(next);
        setOpaque(false);
        timers.current.push(window.setTimeout(() => setShowOverlay(false), FADE_MS));
      }, FADE_MS),
    );
  }, [resolvedTheme, setTheme]);

  if (OFF) return null;

  return (
    <>
      <button
        data-slot="theme-toggler-button"
        type="button"
        aria-label="Ganti tema terang/gelap"
        title="Ganti tema"
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        onClick={handleClick}
      >
        {resolvedTheme === 'dark' ? <Moon /> : <Sun />}
      </button>
      {showOverlay && (
        <div
          aria-hidden
          className={`pointer-events-none fixed inset-0 z-[100] bg-background transition-opacity duration-300 ease-out ${opaque ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </>
  );
}
