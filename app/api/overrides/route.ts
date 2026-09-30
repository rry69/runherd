import { getOverrides, saveOverrides } from "@/lib/overrides";
import { ensurePersistedAliases, type SessionRef } from "@/lib/assign-names";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(getOverrides());
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body: unknown = await req.json();
    return Response.json(saveOverrides(body as Parameters<typeof saveOverrides>[0]));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}

// POST { sessions: [{ id, agent?, parent_id? }] } atau { ids: string[] }:
// assign nama dewa untuk sub-agent (parent_id NOT NULL) yang belum punya alias,
// sesi utama (parent_id NULL) dilewati -> pakai agent asli. Persist ke data/web-overrides.json.
// Alias manual user tidak pernah ditimpa.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessions?: SessionRef[];
      ids?: string[];
    };
    const sessions: SessionRef[] = Array.isArray(body.sessions)
      ? body.sessions.filter((s) => typeof s?.id === "string")
      : Array.isArray(body.ids)
        ? body.ids.filter((id) => typeof id === "string").map((id) => ({ id }))
        : [];
    if (sessions.length === 0) {
      return Response.json({ error: "sessions[] / ids[] kosong" }, { status: 400 });
    }
    const before = getOverrides();
    const aliases = ensurePersistedAliases(sessions.slice(0, 1000));
    const added = Object.keys(aliases).filter((k) => !(k in before.aliases));
    return Response.json({ ok: true, added, aliases });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
