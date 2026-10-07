"use client";

import { LayoutDashboard, Network } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/sessions", label: "Sessions", icon: Network },
];

const IDLE_DELAY = 1500;

export function AppDock() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleIdleReveal = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setVisible(true), IDLE_DELAY);
  }, []);

  const visibleRef = useRef(true);

  useEffect(() => {
    let lastY = window.scrollY;
    let upAcc = 0;
    let downAcc = 0;
    let ticking = false;

    const setDockVisible = (next: boolean) => {
      if (visibleRef.current === next) return;
      visibleRef.current = next;
      setVisible(next);
    };

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;

      // Selalu tampil di paling atas agar tidak flicker saat overscroll/Lenis inertia.
      if (y < 32) {
        upAcc = 0;
        downAcc = 0;
        setDockVisible(true);
        return;
      }

      if (dy > 2) {
        // Scroll ke bawah: sembunyikan cepat tapi butuh akumulasi agar tidak goyang.
        upAcc = 0;
        downAcc += dy;
        if (downAcc > 8) setDockVisible(false);
      } else if (dy < -2) {
        // Scroll ke atas: tampilkan setelah akumulasi cukup (hysteresis).
        downAcc = 0;
        upAcc += -dy;
        if (upAcc > 24) setDockVisible(true);
      }
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
      scheduleIdleReveal();
    };

    const handleActivity = () => scheduleIdleReveal();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    scheduleIdleReveal();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [scheduleIdleReveal]);

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 z-50 h-4"
        onMouseEnter={() => setVisible(true)}
        onTouchStart={() => setVisible(true)}
      />
      <nav
        aria-label="Main navigation"
        aria-hidden={!visible}
        inert={!visible}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-border/60 bg-card/80 p-1 shadow-md backdrop-blur-md will-change-transform transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          visible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[150%] opacity-0"
        }`}
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              title={label}
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Icon aria-hidden="true" className="size-4" />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
