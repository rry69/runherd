import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { ActiveChild, ChangedFile, SessionRow, SubagentTask, ToolEvent } from "./types";

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
      title: string | null;
      output: string | null;
      error: string | null;
      truncated: number | null;
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
      const description = r.description ?? "";
      list.push({
        childSessionId: r.child_id,
        parentSessionId: r.parent_id,
        agent: r.subagent_type ?? "unknown",
        description,
        status: normStatus(r.status),
        startedAt,
        endedAt,
        durationMs: endedAt != null ? Math.max(0, endedAt - startedAt) : null,
        // Kontrak jujur: title = $.state.title ?? description; report = output;
        // errorText = error; truncated = (truncated == 1). tools/tokens diisi
        // di route via getChildTools/getChildTokens (default fail-open di sini).
        title: r.title ?? description,
        report: r.output,
        errorText: r.error,
        truncated: r.truncated === 1,
        tools: [],
        tokens: null,
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
             CAST(json_extract(p.data, '$.state.time.end') AS INTEGER) AS t_end,
             json_extract(p.data, '$.state.title') AS title,
             json_extract(p.data, '$.state.output') AS output,
             json_extract(p.data, '$.state.error') AS error,
             json_extract(p.data, '$.state.metadata.truncated') AS truncated
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

// Tool unik per child session: DISTINCT $.tool dari semua part miliknya.
// - Cap 50 per child (dipotong di JS, bukan SQL — LIMIT per grup tak ada).
// - Fail-open: DB gagal → null (route menghilangkan field agar klien sticky).
export function getChildTools(childIds: string[]): Map<string, string[]> | null {
  const out = new Map<string, string[]>();
  if (childIds.length === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const uniq = [...new Set(childIds.filter(Boolean))];
    for (let i = 0; i < uniq.length; i += 200) {
      const chunk = uniq.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT p.session_id AS session_id, json_extract(p.data, '$.tool') AS tool
             FROM part p
            WHERE p.session_id IN (${placeholders})
              AND json_extract(p.data, '$.tool') IS NOT NULL
            GROUP BY p.session_id, tool`,
        )
        .all(...chunk) as { session_id: string; tool: string }[];
      for (const r of rows) {
        if (!r.tool) continue;
        const list = out.get(r.session_id) ?? [];
        if (!list.includes(r.tool)) list.push(r.tool);
        out.set(r.session_id, list);
      }
    }
    for (const [k, list] of out) out.set(k, list.slice(0, 50));
    return out;
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {}
  }
}

// Total token per child session: SUM($.tokens.total) part `type=step-finish`.
// - Fail-open: DB gagal → null (route menghilangkan field agar klien sticky).
export function getChildTokens(childIds: string[]): Map<string, number> | null {
  const out = new Map<string, number>();
  if (childIds.length === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const uniq = [...new Set(childIds.filter(Boolean))];
    for (let i = 0; i < uniq.length; i += 200) {
      const chunk = uniq.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT p.session_id AS session_id,
                  SUM(CAST(json_extract(p.data, '$.tokens.total') AS INTEGER)) AS total
             FROM part p
            WHERE p.session_id IN (${placeholders})
              AND json_extract(p.data, '$.type') = 'step-finish'
            GROUP BY p.session_id`,
        )
        .all(...chunk) as { session_id: string; total: number | null }[];
      for (const r of rows) out.set(r.session_id, r.total ?? 0);
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

// Riwayat tool per sesi top-level: semua part `tool IS NOT NULL` milik sesi
// itu + seluruh keturunannya (rekursif). Cap 100 per root, sort at DESC.
// Fail-open: DB gagal → null.
export function getToolHistory(parentIds: string[]): Map<string, ToolEvent[]> | null {
  const out = new Map<string, ToolEvent[]>();
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
      agent: string | null;
      tool: string | null;
      status: string | null;
      t_start: number;
      t_updated: number;
      file_path: string | null;
    };
    const ids = [...cand];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT
             p.session_id AS session_id,
             s.agent AS agent,
             json_extract(p.data, '$.tool') AS tool,
             json_extract(p.data, '$.state.status') AS status,
             COALESCE(CAST(json_extract(p.data, '$.state.time.start') AS INTEGER), 0) AS t_start,
             p.time_updated AS t_updated,
             COALESCE(
               json_extract(p.data, '$.state.input.filePath'),
               json_extract(p.data, '$.state.metadata.filepath')
             ) AS file_path
           FROM part p
           LEFT JOIN session s ON s.id = p.session_id
           WHERE p.session_id IN (${placeholders})
             AND json_extract(p.data, '$.tool') IS NOT NULL
             AND json_extract(p.data, '$.state.status') IS NOT NULL
           ORDER BY p.time_updated DESC`,
        )
        .all(...chunk) as Row[];
      for (const r of rows) {
        if (!r.tool || !r.status) continue;
        const st =
          r.status === "running" || r.status === "completed" || r.status === "error"
            ? r.status
            : "completed";
        const at = (r.t_start ? norm(r.t_start) : 0) || norm(r.t_updated);
        const root = rootOf(r.session_id);
        const list = out.get(root) ?? [];
        list.push({
          sessionId: r.session_id,
          tool: r.tool,
          status: st as ToolEvent["status"],
          at,
          filePath: r.file_path ?? null,
          origin: parentOf.get(r.session_id) == null ? "main" : "sub",
          agent: r.agent ?? "unknown",
        });
        out.set(root, list);
      }
    }
    for (const [k, list] of out) {
      list.sort((a, b) => b.at - a.at);
      out.set(k, list.slice(0, 100));
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

function countLines(s: unknown): number {
  if (typeof s !== "string" || s.length === 0) return 0;
  return s.split("\n").length;
}

function parsePatch(patch: string): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) deleted++;
  }
  return { added, deleted };
}

// File berubah per sesi top-level: edit diparse dari filediff.patch unified
// diff ('+'/'-' minus header '+++'/'---', source filediff); fallback bila
// patch kosong: filediff.additions/deletions lalu countLines(new/oldString).
// write: countLines(content)/0. patch files[]: 0/0 patch-list. Agregasi per
// root per file (sum), cap 50, chunk 200. Fail-open null.
export function getChangedFiles(parentIds: string[]): Map<string, ChangedFile[]> | null {
  const perRoot = new Map<string, Map<string, ChangedFile>>();
  if (parentIds.length === 0) return new Map();
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
    const ids = [...cand];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT p.session_id AS session_id, p.data AS raw
             FROM part p
            WHERE p.session_id IN (${placeholders})
              AND (json_extract(p.data, '$.tool') IN ('edit', 'write')
                OR json_extract(p.data, '$.type') = 'patch')`,
        )
        .all(...chunk) as { session_id: string; raw: string }[];
      for (const r of rows) {
        let d: {
          tool?: string;
          type?: string;
          files?: unknown;
          state?: {
            input?: { filePath?: unknown; newString?: unknown; content?: unknown; oldString?: unknown };
            metadata?: { filediff?: { file?: unknown; patch?: unknown; additions?: unknown; deletions?: unknown } };
          };
        };
        try {
          d = JSON.parse(r.raw);
        } catch {
          continue;
        }
        const root = rootOf(r.session_id);
        let bucket = perRoot.get(root);
        if (!bucket) {
          bucket = new Map();
          perRoot.set(root, bucket);
        }
        const merge = (file: string, added: number, deleted: number, source: ChangedFile["source"]) => {
          const prev = bucket.get(file);
          if (!prev) {
            bucket.set(file, { file, added, deleted, source });
          } else if (prev.source === "patch-list" && source !== "patch-list") {
            prev.added += added;
            prev.deleted += deleted;
            prev.source = source;
          } else {
            prev.added += added;
            prev.deleted += deleted;
          }
        };
        if (d.tool === "edit") {
          const inp = d.state?.input ?? {};
          const fd = d.state?.metadata?.filediff;
          const file =
            (typeof inp.filePath === "string" && inp.filePath) ||
            (fd && typeof fd.file === "string" ? fd.file : null);
          if (!file) continue;
          if (typeof fd?.patch === "string" && fd.patch.length > 0) {
            const { added, deleted } = parsePatch(fd.patch);
            merge(file, added, deleted, "filediff");
          } else if (fd && typeof fd.additions === "number" && typeof fd.deletions === "number") {
            merge(file, fd.additions, fd.deletions, "filediff");
          } else {
            merge(file, countLines(inp.newString), countLines(inp.oldString), "filediff");
          }
        } else if (d.tool === "write") {
          const inp = d.state?.input ?? {};
          if (typeof inp.filePath !== "string" || !inp.filePath) continue;
          merge(inp.filePath, countLines(inp.content), 0, "write");
        } else if (d.type === "patch" && Array.isArray(d.files)) {
          for (const f of d.files) {
            if (typeof f !== "string" || !f) continue;
            if (!bucket.has(f)) bucket.set(f, { file: f, added: 0, deleted: 0, source: "patch-list" });
          }
        }
      }
    }
    const out = new Map<string, ChangedFile[]>();
    for (const [k, bucket] of perRoot) {
      const list = [...bucket.values()].sort((a, b) => b.added + b.deleted - (a.added + a.deleted));
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
