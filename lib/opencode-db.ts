import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { ActiveChild, SessionRow } from "./types";

const SRC = String.raw`C:\Users\Hrry\.local\share\opencode\opencode.db`;

// Langsung readonly ke file sumber, TANPA copy.
// Alasan: DB ~10GB — copy tiap poll bikin disk 100%.
// Mode WAL: reader tidak memblokir writer, query SELECT singkat aman.
// Tidak pernah menulis ke file sumber.

// Anak aktif = tool/part yang masih running dalam 2 menit terakhir.
// part.data: { type, tool?, state: { status }, tokens?: { total } }
// Token hanya ada di part step-finish → tool running biasa 0 (UI: sembunyikan).
export const ACTIVE_WINDOW_MS = 120_000;

function openDb(): Database.Database | null {
  if (!existsSync(SRC)) return null;
  return new Database(SRC, { readonly: true, fileMustExist: true });
}

export function getSessions(limit = 200): SessionRow[] {
  const db = openDb();
  if (!db) return [];
  try {
    return db
      .prepare(
        "SELECT id, parent_id, directory, title, agent, time_updated FROM session ORDER BY time_updated DESC LIMIT ?",
      )
      .all(limit) as SessionRow[];
  } finally {
    db.close();
  }
}

// Active children per parent session: child session (s.parent_id = parent)
// yang punya part running + segar (< 2 menit). Satu child → satu baris
// (part running terbaru). Umur = now - part.time_updated, dihitung di JS
// agar konsisten dengan jam dashboard (bukan jam writer DB).
export function getActiveChildren(
  parentIds: string[],
  now = Date.now(),
): Map<string, ActiveChild[]> {
  const out = new Map<string, ActiveChild[]>();
  if (parentIds.length === 0) return out;
  const db = openDb();
  if (!db) return out;
  try {
    const cutoff = now - ACTIVE_WINDOW_MS;
    const seen = new Set<string>();
    for (let i = 0; i < parentIds.length; i += 200) {
      const chunk = parentIds.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      type Row = {
        session_id: string;
        parent_id: string;
        agent: string;
        title: string;
        part_type: string;
        tool: string | null;
        tokens: number;
        time_updated: number;
      };
      const rows = db
        .prepare(
          `SELECT
             s.id AS session_id,
             s.parent_id AS parent_id,
             s.agent AS agent,
             s.title AS title,
             COALESCE(json_extract(p.data, '$.type'), '') AS part_type,
             json_extract(p.data, '$.tool') AS tool,
             COALESCE(CAST(json_extract(p.data, '$.tokens.total') AS INTEGER), 0) AS tokens,
             p.time_updated AS time_updated
           FROM session s
           JOIN part p ON p.session_id = s.id
           WHERE s.parent_id IN (${placeholders})
             AND json_extract(p.data, '$.state.status') = 'running'
             AND p.time_updated > ?
           ORDER BY p.time_updated DESC`,
        )
        .all(...chunk, cutoff) as Row[];
      for (const r of rows) {
        if (seen.has(r.session_id)) continue; // hanya part terbaru per child
        seen.add(r.session_id);
        const list = out.get(r.parent_id) ?? [];
        list.push({
          sessionId: r.session_id,
          parentId: r.parent_id,
          agent: r.agent,
          title: r.title,
          partType: r.part_type,
          tool: r.tool,
          tokens: r.tokens ?? 0,
          updatedAt: r.time_updated,
          ageMs: Math.max(0, now - r.time_updated),
        });
        out.set(r.parent_id, list);
      }
    }
    return out;
  } finally {
    db.close();
  }
}
