import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { ActiveChild, SessionRow } from "./types";

const SRC = String.raw`C:\Users\Hrry\.local\share\opencode\opencode.db`;

// Langsung readonly ke file sumber, TANPA copy.
// Alasan: DB ~10GB — copy tiap poll bikin disk 100%.
// Mode WAL: reader tidak memblokir writer, query SELECT singkat aman.
// Tidak pernah menulis ke file sumber.

// Anak aktif = tool/part running + segar (<30s) + row session masih ada.
// part.data: { type, tool?, state: { status }, tokens?: { total } }
// Token hanya ada di part step-finish → tool running biasa 0 (UI: sembunyikan).
// Rerun sesi sama otomatis thinking: part running baru = thinking, tanpa state manual.
export const ACTIVE_WINDOW_MS = 30_000;

function norm(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

function openDb(): Database.Database | null {
  try {
    if (!existsSync(SRC)) return null;
    return new Database(SRC, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

export function getSessions(limit = 200): SessionRow[] {
  let db: Database.Database | null = null;
  try {
    db = openDb();
  } catch {
    return [];
  }
  if (!db) return [];
  try {
    return db
      .prepare(
        "SELECT id, parent_id, directory, title, agent, time_updated FROM session ORDER BY time_updated DESC LIMIT ?",
      )
      .all(limit) as SessionRow[];
  } catch {
    return [];
  } finally {
    try {
      db.close();
    } catch {}
  }
}

// Active children per parent session: child session (s.parent_id = parent)
// yang punya part running + segar (< 30s) + row session masih ada.
// Satu child → satu baris (part running terbaru). Umur = now - part.time_updated,
// dihitung di JS agar konsisten dengan jam dashboard (bukan jam writer DB).
// Fail-closed: error DB apapun → return Map kosong (idle), jangan throw.
export function getActiveChildren(
  parentIds: string[],
  now = Date.now(),
): Map<string, ActiveChild[]> {
  const out = new Map<string, ActiveChild[]>();
  if (parentIds.length === 0) return out;
  let db: Database.Database | null = null;
  try {
    db = openDb();
  } catch {
    return out;
  }
  if (!db) return out;
  try {
    const cutoff = now - ACTIVE_WINDOW_MS;
    const seen = new Set<string>();
    const existsStmt = db.prepare("SELECT id FROM session WHERE id = ?");
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
      const push = (r: Row, mapKey: string) => {
        const nt = norm(r.time_updated);
        if (nt <= cutoff) return;
        const ck = `${mapKey}|${r.session_id}`;
        if (seen.has(ck)) return;
        try {
          if (!existsStmt.get(r.session_id)) return;
        } catch {
          return;
        }
        seen.add(ck);
        const list = out.get(mapKey) ?? [];
        list.push({
          sessionId: r.session_id,
          parentId: mapKey,
          agent: r.agent,
          title: r.title,
          partType: r.part_type,
          tool: r.tool,
          tokens: r.tokens ?? 0,
          updatedAt: nt,
          ageMs: Math.max(0, now - nt),
        });
        out.set(mapKey, list);
      };
      for (const r of rows) push(r, r.parent_id);
      const direct = db
        .prepare(
          `SELECT
             s.id AS session_id,
             s.id AS parent_id,
             s.agent AS agent,
             s.title AS title,
             COALESCE(json_extract(p.data, '$.type'), '') AS part_type,
             json_extract(p.data, '$.tool') AS tool,
             COALESCE(CAST(json_extract(p.data, '$.tokens.total') AS INTEGER), 0) AS tokens,
             p.time_updated AS time_updated
           FROM session s
           JOIN part p ON p.session_id = s.id
           WHERE s.id IN (${placeholders})
             AND json_extract(p.data, '$.state.status') = 'running'
             AND p.time_updated > ?
           ORDER BY p.time_updated DESC`,
        )
        .all(...chunk, cutoff) as Row[];
      for (const r of direct) push(r, r.session_id);
    }
    return out;
  } catch {
    return new Map<string, ActiveChild[]>();
  } finally {
    try {
      db.close();
    } catch {}
  }
}
