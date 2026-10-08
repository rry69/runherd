'use client';

import { useEffect } from 'react';
import { applyStoredLinearTheme } from '@/lib/linear-themes';

/** Restore tema linear.style dari localStorage — global, bukan overview saja. */
export function LinearThemeInit() {
  useEffect(() => {
    applyStoredLinearTheme();
  }, []);
  return null;
}
