import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
  const agentMax = perAgent.length > 0 ? Math.max(...perAgent.map(([, v]) => v)) : 0;
  const dirMax = perDir.length > 0 ? Math.max(...perDir.map(([, v]) => v)) : 0;
  const scaleMax = Math.max(agentMax, dirMax, 1);

  const [topDirName, topDirValue] = perDir.length > 0 ? perDir[0] : ["—", 0];
  const topDirPct = total > 0 ? Math.round((topDirValue / total) * 100) : 0;
  const isDominant = total > 0 && topDirValue / total > 0.8;

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <Card className="rounded-2xl border-primary/30 p-6 shadow-sm transition-colors hover:border-primary">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-base font-bold">Sessions per Agent</h2>
            <p className="text-xs text-slate-500">
              Skala 0–{scaleMax} · total {total}
            </p>
          </div>
          <Badge className="rounded-full border-0 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            {perAgent.length} agents
          </Badge>
        </div>
        <CardContent className="mt-4 space-y-3 p-0 text-sm">
          {perAgent.map(([name, value]) => (
            <BarRow key={name} name={name} value={value} max={scaleMax} />
          ))}
          {perAgent.length === 0 && (
            <p className="text-xs text-slate-500">Belum ada data agent.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-primary/30 p-6 shadow-sm transition-colors hover:border-primary">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-base font-bold">Sessions per Directory</h2>
            <p className="text-xs text-slate-500">
              Skala 0–{scaleMax} · total {total}
            </p>
          </div>
          <Badge className="rounded-full border-0 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            {perDir.length} dirs
          </Badge>
        </div>
        <CardContent className="mt-4 space-y-3 p-0 text-sm">
          {perDir.map(([name, value]) => (
            <BarRow key={name} name={name} value={value} max={scaleMax} />
          ))}
          {perDir.length === 0 && (
            <p className="text-xs text-slate-500">Belum ada data direktori.</p>
          )}
          {isDominant && (
            <>
              <div className="h-px bg-emerald-100" />
              <p className="rounded-2xl bg-emerald-50 p-3 text-xs text-emerald-900">
                {topDirPct}% sesi berjalan di <b>{topDirName}</b>. Distribusi timpang —
                pertimbangkan split working directory.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
