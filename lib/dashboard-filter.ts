import { useSyncExternalStore } from "react";

let value = "";
const listeners = new Set<() => void>();

export function getFilterDir(): string {
  return value;
}

export function setFilterDir(next: string): void {
  if (next === value) return;
  value = next;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useFilterDir(): string {
  return useSyncExternalStore(subscribe, getFilterDir, getFilterDir);
}
