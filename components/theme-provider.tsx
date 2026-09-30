'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

// Kill-switch: NEXT_PUBLIC_THEME_TOGGLE=off → paksa dark, toggler disembunyikan.
const OFF = process.env.NEXT_PUBLIC_THEME_TOGGLE === 'off';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme={OFF ? 'dark' : undefined}
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
