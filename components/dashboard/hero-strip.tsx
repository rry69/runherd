import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface HeroStripProps {
  total: number;
  active: number;
  critical: number;
  warning: number;
}

export function HeroStrip({ total, active, critical, warning }: HeroStripProps) {
  return (
    <Card
      className="flex flex-col gap-4 overflow-hidden rounded-2xl border-0 p-6 shadow-sm"
      style={{ background: "linear-gradient(120deg,#064e3b,#059669 65%,#65a30d)" }}
    >
      <div className="flex justify-end gap-1.5">
        <span className="rounded-full bg-white/20 p-0.5 text-white backdrop-blur [&_button]:text-white [&_button:hover]:bg-white/20 [&_button:hover]:text-white">
          <ThemeToggle />
        </span>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex-1 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border-0 bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white">
              ● live
            </Badge>
            <Badge
              className="rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold"
              style={{ background: "#a3e635", color: "#064e3b" }}
            >
              Mint SaaS Airy
            </Badge>
          </div>
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
          <div className="rounded-2xl bg-white px-5 py-3 text-center shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Kritis</p>
            <p className="font-heading text-3xl font-extrabold text-emerald-900">{critical}</p>
          </div>
          <div
            className="rounded-2xl bg-white px-5 py-3 text-center shadow-sm ring-1"
            style={{ borderColor: "#a3e635" }}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-lime-700">Warning</p>
            <p className="font-heading text-3xl font-extrabold text-emerald-900">{warning}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
