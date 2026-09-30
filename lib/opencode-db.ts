import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { ActiveChild, SessionRow, SubagentTask } from "./types";

const SRC = String.raw`C:\Users\Hrry\.local\share\opencode\opencode.db`;

// Turn "live" = baris `message` role=assistant yang BELUM punya
// `$.time.completed`. Ini satu-satunya sinyal streaming tanpa tool:
// - Model yang sedang mikir tidak menulis part apa pun, jadi
//   getActiveChildren() (yang hanya melihat part running) selalu kosong di
//   periode itu → sesi sempat tampil idle padahal sedang berpikir.
// - Setiap turn yang selesai SELALU punya `time.completed`, jadi turn selesai
//   tidak pernah cocok. Di DB hanya ada role `user` dan `assistant`, dan tidak
//   ada satu pun baris `user` yang punya `time.completed` → filter
//   role='assistant' itu wajib, tanpa itu tiap baris user = false positive.
//   Tabel `message` tidak punya kolom `$.type`, jadi tidak ada baris
//   summary/compaction/system terpisah yang bisa ikut cocok.
// - Sinyal ini TIDAK membedakan "mikir" dari "menunggu", tapi waiting tidak
//   menghasilkan baris apa pun di DB, jadi tidak ada false positive dari sana.
// - Mapping ke root: turn bisa milik sesi anak, naik ke top-level dengan
//   parent map yang sama seperti getActiveChildren (rekursif, depth berapa pun).
// - Nilai = time_created turn terbaru (ms) yang belum settle per root,
//   dipakai klien untuk status dan batas orphan (cap 15 menit).
// - Fail-open: error DB → null, rute API menghilangkan field `live` agar klien
//   mempertahankan status terakhir (tidak auto-idle).
// ponytail: full scan `message` (json_extract tidak pakai index, ±22ms pada
// 2.8k baris); tambah kolom generated + index bila baris tumbuh banyak.

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

// Jumlah total sesi. Dipakai untuk badge "N sesi".
export function getSessionCount(): number {
  const db = openDb();
  if (!db) throw new Error("gagal membuka DB opencode");
  try {
    const row = db.prepare("SELECT COUNT(*) AS c FROM session").get() as { c: number };
    return row.c;
  } catch (e) {
    throw e instanceof Error ? e : new Error("gagal hitung session");
  } finally {
    try {
      db.close();
    } catch {}
  }
}

// Riwayat task subagent per sesi top-level: semua part `tool=task`
// milik sesi itu + seluruh keturunannya (rekursif).
// - Mapping ke root lewat state.metadata.parentSessionId (fallback session_id).
// - Status lowercase; apa pun selain running/error → completed.
// - Running = state.time.end belum ada → endedAt/durationMs null.
// - Fail-open: DB gagal → null (UI boleh render cache lama).
// ponytail: full-table session + cap 50/sesi; tambah pagination bila perlu
// lebih dari 50 task per sesi.
export function getTaskHistory(
  parentIds: string[],
): Map<string, SubagentTask[]> | null {
  const out = new Map<string, SubagentTask[]>();
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
      time_updated: number;
      status: string | null;
      subagent_type: string | null;
      description: string | null;
      child_id: string | null;
      parent_id: string | null;
      t_start: number;
      t_end: number | null;
    };

    const normStatus = (s: string | null): SubagentTask["status"] =>
      s === "running" || s === "error" ? s : "completed";

    const seen = new Set<string>();
    const push = (r: Row, mapKey: string) => {
      // child_id bisa null → session_id + time_updated sebagai pengenal.
      const ck = `${mapKey}|${r.child_id ?? r.session_id}|${r.time_updated}`;
      if (seen.has(ck)) return;
      seen.add(ck);
      const startedAt = norm(r.t_start) || norm(r.time_updated);
      const endedAt = r.t_end ? norm(r.t_end) : null;
      const list = out.get(mapKey) ?? [];
      list.push({
        childSessionId: r.child_id,
        parentSessionId: r.parent_id,
        agent: r.subagent_type ?? "unknown",
        description: r.description ?? "",
        status: normStatus(r.status),
        startedAt,
        endedAt,
        durationMs: endedAt != null ? Math.max(0, endedAt - startedAt) : null,
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
             p.session_id AS session_id,
             p.time_updated AS time_updated,
             json_extract(p.data, '$.state.status') AS status,
             json_extract(p.data, '$.state.input.subagent_type') AS subagent_type,
             json_extract(p.data, '$.state.input.description') AS description,
             json_extract(p.data, '$.state.metadata.sessionId') AS child_id,
             json_extract(p.data, '$.state.metadata.parentSessionId') AS parent_id,
             COALESCE(CAST(json_extract(p.data, '$.state.time.start') AS INTEGER), 0) AS t_start,
             CAST(json_extract(p.data, '$.state.time.end') AS INTEGER) AS t_end
           FROM part p
           WHERE p.session_id IN (${placeholders})
             AND json_extract(p.data, '$.tool') = 'task'
             AND json_extract(p.data, '$.state.status') IS NOT NULL
           ORDER BY p.time_updated DESC`,
        )
        .all(...chunk) as Row[];
      for (const r of rows) push(r, rootOf(r.parent_id ?? r.session_id));
    }

    // Running dulu, lalu terbaru; cap 50 per sesi.
    for (const [k, list] of out) {
      list.sort((a, b) => {
        if (a.status !== b.status) return a.status === "running" ? -1 : 1;
        return b.startedAt - a.startedAt;
      });
      out.set(k, list.slice(0, 50));
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

// Turn berjalan per sesi top-level: root session id → time_created (ms) turn
// assistant yang belum selesai. Lihat blok komentar di atas `norm`.
// Kandidat = semua turn assistant yang belum selesai di DB; masing-masing
// dipetakan ke root-nya, lalu hanya root yang diminta yang disimpan (root itu
// sendiri), supaya payload tidak membocorkan sesi anak.
// Fail-open: DB gagal → null (klien pertahankan status terakhir).
export function getLiveTurns(parentIds: string[]): Map<string, number> | null {
  const want = new Set(parentIds);
  const out = new Map<string, number>();
  if (want.size === 0) return out;
  const db = openDb();
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

    type Row = { session_id: string; time_created: number };
    const rows = db
      .prepare(
        `SELECT session_id AS session_id, time_created AS time_created
           FROM message
          WHERE json_extract(data, '$.role') = 'assistant'
            AND json_extract(data, '$.time.completed') IS NULL`,
      )
      .all() as Row[];

    for (const r of rows) {
      const root = rootOf(r.session_id);
      if (!want.has(root)) continue;
      const nt = norm(r.time_created);
      // Turn TERBARU yang belum settle = umur thinking yang dilaporkan: turn
      // crash yang basi tidak membekukan sesi yang sudah di-resume dan bekerja
      // normal, sedangkan turn crash yang sendirian tetap jadi yang terbaru →
      // tetap menua melewati cap 15 menit.
      const prev = out.get(root);
      if (prev == null || nt > prev) out.set(root, nt);
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
