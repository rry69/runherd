import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { ActiveChild, SessionRow } from "./types";

const SRC = String.raw`C:\Users\Hrry\.local\share\opencode\opencode.db`;

// Langsung readonly ke file sumber, TANPA copy.
// Alasan: DB ~10GB — copy tiap poll bikin disk 100%.
// Mode WAL: reader tidak memblokir writer, query SELECT singkat aman.
// Tidak pernah menulis ke file sumber.

// Anak aktif = part berstatus `running`, APAPUN tipenya (generic —
// tanpa hardcode nama agent/tool/warna).
// - thinking = ada >=1 proses aktif; idle hanya bila semua proses
//   explicit selesai (completed/error).
// - FAIL-OPEN: tanpa cutoff waktu. Stuck / heartbeat telat /
//   disconnect tetap thinking, bukan auto-idle.
// - Rekursif: aktivitas anak/cucu (depth>=2) di-bubble ke sesi
//   top-level, layout graf tetap 2 level.
// - Token hanya ada di part step-finish → tool running biasa 0
//   (UI: sembunyikan).
// - Rerun sesi sama otomatis thinking: part running baru = thinking,
//   tanpa state manual.
// - Umur = now - part.time_updated, dihitung di JS agar konsisten
//   dengan jam dashboard (bukan jam writer DB).
// - Fail-open: error DB apapun → return null (rute API menghilangkan
//   field `active` agar klien mempertahankan status terakhir),
//   jangan throw / jangan klaim idle.

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
  const db = openDb();
  if (!db) throw new Error("gagal membuka DB opencode");
  try {
    return db
      .prepare(
        "SELECT id, parent_id, directory, title, agent, time_updated FROM session ORDER BY time_updated DESC LIMIT ?",
      )
      .all(limit) as SessionRow[];
  } catch (e) {
    throw e instanceof Error ? e : new Error("gagal query session");
  } finally {
    try {
      db.close();
    } catch {}
  }
}

// Active children per sesi top-level: gabungan semua proses running
// milik sesi itu + seluruh keturunannya (rekursif, depth berapa pun).
// Satu sesi anak → satu baris (part running terbaru).
// ponytail: parent map full-table; ganti WITH RECURSIVE bila session membesar.
export function getActiveChildren(
  parentIds: string[],
  now = Date.now(),
): Map<string, ActiveChild[]> | null {
  const out = new Map<string, ActiveChild[]>();
  if (parentIds.length === 0) return out;
  let db: Database.Database | null = null;
  try {
    db = openDb();
  } catch {
    return null;
  }
  if (!db) return null;
  try {
    const parentOf = new Map<string, string | null>();
    const sess = db.prepare("SELECT id, parent_id FROM session").all() as {
      id: string;
      parent_id: string | null;
    }[];
    for (const s of sess) parentOf.set(s.id, s.parent_id);

    // Naik ke top-level (parent_id null); siklus diputus.
    const rootOf = (id: string): string => {
      let cur = id;
      const seen = new Set([cur]);
      for (;;) {
        const p = parentOf.get(cur);
        if (!p || seen.has(p)) return cur;
        seen.add(p);
        cur = p;
      }
    };

    // Kandidat = parentIds + seluruh keturunan (depth berapa pun).
    const childrenOf = new Map<string, string[]>();
    for (const [id, p] of parentOf) {
      if (p == null) continue;
      const list = childrenOf.get(p) ?? [];
      list.push(id);
      childrenOf.set(p, list);
    }
    const cand = new Set<string>(parentIds);
    const stack = [...parentIds];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const c of childrenOf.get(cur) ?? []) {
        if (!cand.has(c)) {
          cand.add(c);
          stack.push(c);
        }
      }
    }

    type Row = {
      session_id: string;
      agent: string;
      title: string;
      part_type: string;
      tool: string | null;
      tokens: number;
      time_updated: number;
    };
    const seen = new Set<string>();
    const push = (r: Row, mapKey: string) => {
      const nt = norm(r.time_updated);
      const ck = `${mapKey}|${r.session_id}`;
      if (seen.has(ck)) return;
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

    const ids = [...cand];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT
             s.id AS session_id,
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
           ORDER BY p.time_updated DESC`,
        )
        .all(...chunk) as Row[];
      // ORDER DESC + dedupe = part running terbaru per sesi anak.
      for (const r of rows) push(r, rootOf(r.session_id));
    }
    return out;
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {}
  }
}
