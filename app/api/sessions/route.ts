import { assignDisplayNames } from "@/lib/assign-names";
import { getActiveChildren, getSessions } from "@/lib/opencode-db";
import { getOverrides } from "@/lib/overrides";
import type { ActiveChild } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = getSessions();
    const overrides = getOverrides();
    // Nama display in-memory (tanpa write per-poll);
    // persist via POST /api/overrides.
    const auto = assignDisplayNames(
      rows.map((r) => ({ id: r.id, agent: r.agent, parent_id: r.parent_id })),
      overrides.aliases,
    );
    const names: Record<string, string> = {};
    for (const r of rows) names[r.id] = overrides.aliases[r.id] ?? auto[r.id] ?? r.agent;
    const activeMap = getActiveChildren(rows.map((r) => r.id));
    const active: Record<string, ActiveChild[]> = {};
    for (const [k, v] of activeMap) active[k] = v;
    return Response.json({ ok: true, count: rows.length, data: rows, names, active });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
