"use client";

import { Coins, LayoutDashboard, Network } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/sessions", label: "Sessions", icon: Network },
  { href: "/router", label: "Router", icon: Coins },
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

  useEffect(() => {
    let previousScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > previousScrollY + 2) setVisible(false);
      else if (currentScrollY < previousScrollY - 2) setVisible(true);
      previousScrollY = currentScrollY;
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
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-border/60 bg-card/80 p-1 shadow-md backdrop-blur-md transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          visible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0"
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
