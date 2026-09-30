import { assignDisplayNames } from "@/lib/assign-names";
import { getActiveChildren, getSessions } from "@/lib/opencode-db";
import { getOverrides } from "@/lib/overrides";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

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
    // Fail-open: DB error → field `active` dihilangkan agar klien
    // mempertahankan status terakhir (tetap thinking), bukan auto-idle.
    const payload: Record<string, unknown> = {
      ok: true,
      count: rows.length,
      data: rows,
      names,
    };
    const activeMap = getActiveChildren(rows.map((r) => r.id));
    if (activeMap) payload.active = Object.fromEntries(activeMap);
    return Response.json(payload, { headers: NO_STORE });
  } catch {
    // ok:false agar klien sticky (tidak menimpa rows/active terakhir).
    return Response.json({ ok: false, error: "gagal membaca DB" }, { status: 500, headers: NO_STORE });
  }
}
