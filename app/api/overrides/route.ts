import { getOverrides, saveOverrides } from "@/lib/overrides";

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
