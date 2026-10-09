import { getHermesFilePatch } from "@/lib/hermes-db";
import { getFilePatch } from "@/lib/opencode-db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Lazy patch per file (Opsi A): payload patch TIDAK ikut poll 1s
// /api/sessions, hanya diambil saat user expand satu file di Inspector.
// Fail-open: DB gagal / tidak ada patch → {ok:false} + pesan jujur di klien.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = (url.searchParams.get("session") ?? "").trim();
  const file = (url.searchParams.get("file") ?? "").trim();
  if (!session || !file) {
    return Response.json({ ok: false, error: "param session & file wajib" }, { headers: NO_STORE });
  }
  // Guard path traversal: tolak absolut di luar project / `..`.
  if (file.includes("..")) {
    return Response.json({ ok: false, error: "path tidak valid" }, { headers: NO_STORE });
  }
  try {
    // ID opencode (ses_*) vs Hermes tak bertabrakan — coba opencode dulu,
    // lalu Hermes. Pertama menang bila ada patch.
    const op = getFilePatch(session, file);
    if (op) return Response.json({ ok: true, patch: op.patch, truncated: op.truncated }, { headers: NO_STORE });
    const herm = getHermesFilePatch(session, file);
    if (herm) return Response.json({ ok: true, patch: herm.patch, truncated: herm.truncated }, { headers: NO_STORE });
    return Response.json({ ok: false, error: "Patch tidak tersedia" }, { headers: NO_STORE });
  } catch {
    return Response.json({ ok: false, error: "gagal membaca patch" }, { headers: NO_STORE });
  }
}
