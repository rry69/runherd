import { Clock, LayoutGrid, Users, XCircle } from "lucide-react";
import { Line, LineChart } from "recharts";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardsProps {
  total: number;
  active: number;
  failed: number;
  queued: number;
  activeDetail?: string;
  failedDetail?: string;
  history?: { total: number[]; active: number[]; failed: number[]; queued: number[] };
}

function toPoints(arr: number[]): { i: number; v: number }[] {
  return arr.map((v, i) => ({ i, v }));
}

function Spark({
  data,
  current,
  stroke,
  id,
}: {
  data: number[];
  current: number;
  stroke: string;
  id: string;
}) {
  const src = data.length >= 2 ? data : [current, current];
  const points = toPoints(src);
  void id;
  const n = points.length;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const W = 96;
  const H = 36;
  const P = 4;
  const lastIdx = n - 1;
  const lastX = n <= 1 ? W / 2 : P + (lastIdx / (n - 1)) * (W - P * 2);
  let lastY = H / 2;
  if (n > 1 && max !== min) {
    lastY = P + (1 - (vs[lastIdx] - min) / (max - min)) * (H - P * 2);
  }
  return (
    <div aria-hidden="true">
      <LineChart
        width={96}
        height={36}
        data={points}
        margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
      >
        <Line
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <circle
          cx={lastX}
          cy={lastY}
          r={3}
          fill={stroke}
          stroke="#fff"
          strokeWidth={1.5}
        />
      </LineChart>
    </div>
  );
}

export function KpiCards({
  total,
  active,
  failed,
  queued,
  activeDetail,
  failedDetail,
  history,
}: KpiCardsProps) {
  const failedRate = total > 0 ? ((failed / total) * 100).toFixed(1) : "0.0";

  return (
    <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-2xl border-primary/30 p-5 shadow-sm transition-colors hover:border-primary">
        <div className="flex items-start justify-between">
          <LayoutGrid
            size={22}
            strokeWidth={2.2}
            className="text-emerald-700 dark:text-emerald-400"
          />
          <Spark data={history?.total ?? []} current={total} stroke="#059669" id="total" />
        </div>
        <CardContent className="mt-4 p-0">
          <p className="text-sm font-medium text-slate-500">Total Sessions</p>
          <p className="font-heading text-4xl font-extrabold">{total}</p>
          <p className="mt-1 text-xs text-slate-500">Total seluruh sesi terpantau</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-primary/30 p-5 shadow-sm transition-colors hover:border-primary">
        <div className="flex items-start justify-between">
          <Users size={22} strokeWidth={2.2} className="text-lime-700 dark:text-lime-400" />
          <Spark data={history?.active ?? []} current={active} stroke="#65a30d" id="active" />
        </div>
        <CardContent className="mt-4 p-0">
          <p className="text-sm font-medium text-slate-500">Active Agents</p>
          <p className="font-heading text-4xl font-extrabold">{active}</p>
          <p className="mt-1 text-xs text-slate-500">{activeDetail ?? "Agent sedang berjalan"}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-primary/30 p-5 shadow-sm transition-colors hover:border-primary">
        <div className="flex items-start justify-between">
          <XCircle
            size={22}
            strokeWidth={2.2}
            className="text-slate-500 dark:text-slate-400"
          />
          <Spark data={history?.failed ?? []} current={failed} stroke="#64748b" id="failed" />
        </div>
        <CardContent className="mt-4 p-0">
          <p className="text-sm font-medium text-slate-500">Failed</p>
          <p className="font-heading text-4xl font-extrabold">{failed}</p>
          <p className="mt-1 text-xs text-slate-500">
            {failedDetail ?? `${failedRate}% error rate`}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-primary/30 p-5 shadow-sm transition-colors hover:border-primary">
        <div className="flex items-start justify-between">
          <Clock
            size={22}
            strokeWidth={2.2}
            className="text-slate-500 dark:text-slate-400"
          />
          <Spark data={history?.queued ?? []} current={queued} stroke="#94a3b8" id="queued" />
        </div>
        <CardContent className="mt-4 p-0">
          <p className="text-sm font-medium text-slate-500">Queued</p>
          <p className="font-heading text-4xl font-extrabold">{queued}</p>
          <p className="mt-1 text-xs text-slate-500">Menunggu giliran eksekusi</p>
        </CardContent>
      </Card>
    </section>
  );
}
