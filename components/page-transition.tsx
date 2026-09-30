"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// ponytail: kill-switch statis via env; butuh disable runtime tanpa rebuild,
// set document.documentElement.dataset.pageTransition = "off".
const ENABLED = !["0", "false", "off", "no"].includes(
  (process.env.NEXT_PUBLIC_ENABLE_PAGE_TRANSITION ?? "").toLowerCase(),
);

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  if (!ENABLED) return <div className={className}>{children}</div>;
  return (
    <div
      key={pathname}
      className={className ? `${className} page-transition` : "page-transition"}
    >
      {children}
    </div>
  );
}
