"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import BorderGlow from "@/components/BorderGlow";

interface BreakdownBarsProps {
  perAgent: [string, number][];
  perDir: [string, number][];
  total: number;
}

function BarRow({ name, value, max }: { name: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="font-semibold">{name}</span>
        <span className="font-bold">{value}</span>
      </div>
      <div className="bar-track overflow-hidden rounded-full">
        <div
          className="bar-fill rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function BreakdownBars({ perAgent, perDir, total }: BreakdownBarsProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const agentMax = perAgent.length > 0 ? Math.max(...perAgent.map(([, v]) => v)) : 0;
  const dirMax = perDir.length > 0 ? Math.max(...perDir.map(([, v]) => v)) : 0;
  const scaleMax = Math.max(agentMax, dirMax, 1);

  const [topDirName, topDirValue] = perDir.length > 0 ? perDir[0] : ["—", 0];
  const topDirPct = total > 0 ? Math.round((topDirValue / total) * 100) : 0;
  const isDominant = total > 0 && topDirValue / total > 0.8;

  const isDark = mounted && resolvedTheme === "dark";
  const cardClassName = isDark
    ? "rounded-2xl border-0 bg-transparent p-6 shadow-none backdrop-blur transition-colors overflow-hidden"
    : "rounded-2xl border border-primary/20 bg-transparent p-6 shadow-none backdrop-blur transition-colors hover:border-primary";
  const cardStyle = isDark
    ? { background: "transparent", borderColor: "transparent" }
    : { background: "transparent" };

  const withGlow = (node: ReactNode) => {
    if (!isDark) return node;
    return (
      <BorderGlow
        glowColor="40 80 80"
        backgroundColor="#120F17"
        borderRadius={16}
        glowRadius={40}
        glowIntensity={1.0}
        coneSpread={25}
        animated={false}
        edgeSensitivity={30}
        colors={["#c084fc", "#f472b6", "#38bdf8"]}
        fillOpacity={0.5}
      >
        {node}
      </BorderGlow>
    );
  };

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      {withGlow(
        <Card className={cardClassName} style={cardStyle}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-bold">Sessions per Agent</h2>
              <p className="text-xs text-muted-foreground">
                Skala 0–{scaleMax} · total {total}
              </p>
            </div>
            <Badge className="rounded-full border-0 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground">
              {perAgent.length} agents
            </Badge>
          </div>
          <CardContent className="mt-4 space-y-3 p-0 text-sm">
            {perAgent.map(([name, value]) => (
              <BarRow key={name} name={name} value={value} max={scaleMax} />
            ))}
            {perAgent.length === 0 && (
              <p className="text-xs text-muted-foreground">Belum ada data agent.</p>
            )}
          </CardContent>
        </Card>
      )}

      {withGlow(
        <Card className={cardClassName} style={cardStyle}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-bold">Sessions per Directory</h2>
              <p className="text-xs text-muted-foreground">
                Skala 0–{scaleMax} · total {total}
              </p>
            </div>
            <Badge className="rounded-full border-0 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground">
              {perDir.length} dirs
            </Badge>
          </div>
          <CardContent className="mt-4 space-y-3 p-0 text-sm">
            {perDir.map(([name, value]) => (
              <BarRow key={name} name={name} value={value} max={scaleMax} />
            ))}
            {perDir.length === 0 && (
              <p className="text-xs text-muted-foreground">Belum ada data direktori.</p>
            )}
            {isDominant && (
              <>
                <div className="h-px bg-border" />
                <p className="rounded-2xl bg-primary/10 p-3 text-xs text-foreground">
                  {topDirPct}% sesi berjalan di <b>{topDirName}</b>. Distribusi timpang —
                  pertimbangkan split working directory.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
