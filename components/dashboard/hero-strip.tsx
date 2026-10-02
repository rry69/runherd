"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Card } from "@/components/ui/card";
import BorderGlow from "@/components/BorderGlow";

interface HeroStripProps {
  total: number;
  active: number;
  critical: number;
  warning: number;
}

export function HeroStrip({ total, active, critical, warning }: HeroStripProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const lightCard = (
    <Card
      className="flex flex-col gap-4 overflow-hidden rounded-2xl border-0 p-6 shadow-sm"
      style={{ background: "linear-gradient(120deg,#064e3b,#059669 65%,#65a30d)" }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex-1 text-white">
          <h1 className="mt-2 text-2xl font-extrabold leading-tight">
            Selamat pagi, Harry — semua agent terpantau.
          </h1>
          <p className="mt-1 text-sm text-emerald-50">
            {total} sesi · {active} agent aktif ·{" "}
            <b>
              {critical} kritis / {warning} warning
            </b>
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-white/25 bg-white/15 px-5 py-3 text-center text-white shadow-sm backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">Kritis</p>
            <p className="font-heading text-3xl font-extrabold text-white">{critical}</p>
          </div>
          <div className="rounded-2xl border border-white/25 bg-white/15 px-5 py-3 text-center text-white shadow-sm backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">Warning</p>
            <p className="font-heading text-3xl font-extrabold text-white">{warning}</p>
          </div>
        </div>
      </div>
    </Card>
  );

  if (!mounted) {
    return lightCard;
  }

  if (resolvedTheme === "dark") {
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
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1 text-white">
              <h1 className="mt-2 text-2xl font-extrabold leading-tight text-white">
                Selamat pagi, Harry — semua agent terpantau.
              </h1>
              <p className="mt-1 text-sm text-white/80">
                {total} sesi · {active} agent aktif ·{" "}
                <b>
                  {critical} kritis / {warning} warning
                </b>
              </p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center backdrop-blur">
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">Kritis</p>
                <p className="font-heading text-3xl font-extrabold text-foreground">{critical}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center backdrop-blur">
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">Warning</p>
                <p className="font-heading text-3xl font-extrabold text-foreground">{warning}</p>
              </div>
            </div>
          </div>
        </div>
      </BorderGlow>
    );
  }

  return lightCard;
}
