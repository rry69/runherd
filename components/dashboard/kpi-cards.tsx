import { Clock, LayoutGrid, Users, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardsProps {
  total: number;
  active: number;
  failed: number;
  queued: number;
  activeDetail?: string;
  failedDetail?: string;
}

export function KpiCards({
  total,
  active,
  failed,
  queued,
  activeDetail,
  failedDetail,
}: KpiCardsProps) {
  const failedRate = total > 0 ? ((failed / total) * 100).toFixed(1) : "0.0";

  return (
    <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <span
            className="grid size-11 place-items-center rounded-2xl text-white"
            style={{ background: "#059669" }}
          >
            <LayoutGrid size={20} />
          </span>
          <Badge className="rounded-full border-0 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
            ▲ +12%
          </Badge>
        </div>
        <CardContent className="mt-4 p-0">
          <p className="text-sm font-medium text-slate-500">Total Sessions</p>
          <p className="font-heading text-4xl font-extrabold">{total}</p>
          <p className="mt-1 text-xs text-slate-500">Total seluruh sesi terpantau</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <span
            className="grid size-11 place-items-center rounded-2xl"
            style={{ background: "#a3e635", color: "#064e3b" }}
          >
            <Users size={20} />
          </span>
          <Badge className="rounded-full border-0 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
            ▲ +2
          </Badge>
        </div>
        <CardContent className="mt-4 p-0">
          <p className="text-sm font-medium text-slate-500">Active Agents</p>
          <p className="font-heading text-4xl font-extrabold">{active}</p>
          <p className="mt-1 text-xs text-slate-500">{activeDetail ?? "Agent sedang berjalan"}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <span className="grid size-11 place-items-center rounded-2xl bg-white text-emerald-700 ring-1 ring-emerald-200">
            <XCircle size={20} />
          </span>
          <Badge className="rounded-full border-0 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
            ▼ −1
          </Badge>
        </div>
        <CardContent className="mt-4 p-0">
          <p className="text-sm font-medium text-slate-500">Failed</p>
          <p className="font-heading text-4xl font-extrabold">{failed}</p>
          <p className="mt-1 text-xs text-slate-500">
            {failedDetail ?? `${failedRate}% error rate`}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-950 text-lime-300">
            <Clock size={20} />
          </span>
          <Badge className="rounded-full border-0 bg-lime-100 px-2 py-0.5 text-xs font-bold text-lime-800">
            ● steady
          </Badge>
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
