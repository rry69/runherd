"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AliasRow = { id: string; agent: string; parent_id: string | null; title: string; display: string };

export function AliasSettingsList() {
  const [rows, setRows] = React.useState<AliasRow[]>([]);
  const [aliases, setAliases] = React.useState<Record<string, string>>({});
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [loaded, setLoaded] = React.useState(false);
  const [savingId, setSavingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [sRes, oRes] = await Promise.all([
          fetch("/api/sessions", { cache: "no-store" }),
          fetch("/api/overrides", { cache: "no-store" }),
        ]);
        const sJson = await sRes.json();
        const oJson = await oRes.json();
        if (!alive) return;
        const data = (sJson.data ?? []) as { id: string; agent: string; parent_id: string | null; title: string }[];
        const names = (sJson.names ?? {}) as Record<string, string>;
        const al = (oJson.aliases ?? {}) as Record<string, string>;
        const mains = data.filter((r) => r.parent_id === null);
        setRows(
          mains.map((r) => ({
            id: r.id,
            agent: r.agent,
            parent_id: r.parent_id,
            title: r.title,
            display: al[r.id] ?? names[r.id] ?? r.agent,
          })),
        );
        setAliases(al);
        setHidden(oJson.hidden ?? []);
        const d: Record<string, string> = {};
        for (const r of mains) d[r.id] = al[r.id] ?? "";
        setDrafts(d);
        setLoaded(true);
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async (id: string) => {
    const trimmed = (drafts[id] ?? "").trim();
    const next = { ...aliases };
    if (!trimmed) delete next[id];
    else next[id] = trimmed;
    setSavingId(id);
    try {
      await fetch("/api/overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aliases: next, hidden }),
      });
      setAliases(next);
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, display: trimmed || r.agent || r.id.slice(0, 8) } : r,
        ),
      );
    } catch {
      // abaikan; polling/load ulang menimpa
    } finally {
      setSavingId(null);
    }
  };

  if (!loaded) return <p className="p-4 text-sm opacity-60">Memuat…</p>;
  if (rows.length === 0) return <p className="p-4 text-sm opacity-60">Belum ada sesi.</p>;
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {rows.map((r) => (
        <div key={r.id} className="rounded-md border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{r.display}</span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              utama
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {r.agent} · {r.id.slice(0, 8)}
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Alias… (kosong = agent asli)"
              value={drafts[r.id] ?? ""}
              onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
            />
            <Button size="sm" onClick={() => save(r.id)} disabled={savingId === r.id}>
              {savingId === r.id ? "…" : "Simpan"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
