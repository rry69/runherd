"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActiveChild, SessionRow } from "@/lib/types";

export default function Home() {
  const [rows, setRows] = React.useState<SessionRow[]>([]);
  const [activeMap, setActiveMap] = React.useState<Record<string, ActiveChild[]>>({});
  const [hidden, setHidden] = React.useState<string[]>([]);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [sRes, oRes] = await Promise.all([
          fetch("/api/sessions", { cache: "no-store" }),
          fetch("/api/overrides", { cache: "no-store" }),
        ]);
        const sJson = await sRes.json();
        const oJson = await oRes.json();
        if (!alive) return;
        setRows((sJson.data ?? []) as SessionRow[]);
        setActiveMap((sJson.active ?? {}) as Record<string, ActiveChild[]>);
        setHidden((oJson.hidden ?? []) as string[]);
      } catch {}
    };
    load();
    const t = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);
  const isHidden = (r: SessionRow) =>
    hiddenSet.has(r.id) || hiddenSet.has(`agent:${r.agent || "unknown"}`);
  const mains = rows.filter((r) => r.parent_id === null && !isHidden(r));
  const activeCount = rows.filter((r) => (activeMap[r.id]?.length ?? 0) > 0).length;
  const hiddenCount = rows.filter(isHidden).length;
  const perAgent = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.agent || "unknown", (m.get(r.agent || "unknown") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const perDir = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.directory, (m.get(r.directory) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const stats = [
    ["Total sesi", rows.length],
    ["Agent utama", mains.length],
    ["Thinking aktif", activeCount],
    ["Hidden", hiddenCount],
  ] as const;

  return (
    <main className="flex w-full flex-col gap-4 bg-transparent p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Overview
            <Badge variant="secondary">poll 1.5s</Badge>
            <Badge variant="outline">read-only</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map(([label, v]) => (
              <div key={label} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Per-agent</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {perAgent.length === 0 && <p className="text-sm opacity-60">Belum ada data.</p>}
            {perAgent.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{k}</span>
                <Badge variant="secondary">{v}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Per-directory</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {perDir.length === 0 && <p className="text-sm opacity-60">Belum ada data.</p>}
            {perDir.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate" title={k}>{k}</span>
                <Badge variant="secondary">{v}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
