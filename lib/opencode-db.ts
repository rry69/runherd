import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type {
  ActiveChild,
  ChangedFile,
  SessionRow,
  SubagentTask,
  TokenByModel,
  TokenDaily,
  SessionModel,
  SessionModelTokens,
  TokenSession,
  TokenStats,
  ToolEvent,
} from "./types";

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

// String pertama yang bukan null/kosong setelah trim (untuk ringkasan input tool).
function firstText(...xs: (string | null)[]): string | null {
  for (const x of xs) {
    const s = typeof x === "string" ? x.trim() : "";
    if (s) return s;
  }
  return null;
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

// Riwayat thinking main agent per sesi top-level: 1 baris per turn assistant
// yang SUDAH completed (punya `$.time.completed`), HANYA milik sesi
// top-level itu sendiri (tanpa keturunan) — tanpa spawn sub-agent apapun.
// - startedAt = norm(time_created kolom), endedAt = norm($.time.completed),
//   durationMs = max(0, end-start) sesuai kesepakatan.
// - agent = 'main' agar Inspector menampilkan badge Main yang berbeda.
// - childSessionId null → route melewati enrichment tools/tokens.
// - Judul = prompt user pemicu (1 prompt → 1 baris meski turn-nya banyak);
//   fallback tool pertama turn, mentok "thinking main".
// - Sort startedAt DESC, cap 50/sesi. Fail-open: DB gagal → null.
export function getMainThinkingHistory(
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
    type Row = { session_id: string; msg_id: string; t_start: number; t_end: number | null };
    // Kumpulkan SEMUA turn assistant (completed + running), lalu gabungkan
    // per prompt pemicu: 1 prompt → 1 baris, berapa pun turn-nya.
    const turns: Row[] = [];
    for (let i = 0; i < parentIds.length; i += 200) {
      const chunk = parentIds.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      // msg_id per baris (object identity) untuk pelabelan judul belakangan.
      const rows = db
        .prepare(
          `SELECT session_id AS session_id,
                  id AS msg_id,
                  time_created AS t_start,
                  CAST(json_extract(data, '$.time.completed') AS INTEGER) AS t_end
             FROM message
            WHERE session_id IN (${placeholders})
              AND json_extract(data, '$.role') = 'assistant'
            ORDER BY time_created DESC`,
        )
        .all(...chunk) as Row[];
      for (const r of rows) turns.push(r);
    }
    // Prompt user per sesi (teks pertama per user message, ASC) untuk
    // menentukan pemicu tiap turn + judul baris grup.
    const bySess = new Map<string, { u_start: number; text: string }[]>();
    const sessIds = [...new Set(turns.map((t) => t.session_id))];
    for (let i = 0; i < sessIds.length; i += 200) {
      const chunk = sessIds.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const um = db
        .prepare(
          `SELECT m.session_id AS session_id,
                  m.time_created AS u_start,
                  (SELECT json_extract(p.data, '$.text') FROM part p
                    WHERE p.message_id = m.id
                      AND json_extract(p.data, '$.type') = 'text'
                    ORDER BY p.time_created ASC LIMIT 1) AS text
             FROM message m
            WHERE m.session_id IN (${placeholders})
              AND json_extract(m.data, '$.role') = 'user'
            ORDER BY m.time_created ASC`,
        )
        .all(...chunk) as { session_id: string; u_start: number; text: string | null }[];
      for (const u of um) {
        if (!u.text) continue;
        const arr = bySess.get(u.session_id) ?? [];
        arr.push({ u_start: u.u_start, text: u.text });
        bySess.set(u.session_id, arr);
      }
    }
    const promptOf = (session_id: string, t_start: number): { key: string; text: string | null } => {
      const arr = bySess.get(session_id);
      let best: { u_start: number; text: string } | null = null;
      if (arr) {
        for (const u of arr) {
          if (norm(u.u_start) <= norm(t_start)) best = u;
          else break;
        }
      }
      // Tanpa prompt (mis. lanjutan compaction): tiap turn baris sendiri.
      if (!best) return { key: `turn|${session_id}|${t_start}`, text: null };
      return { key: `prompt|${session_id}|${best.u_start}`, text: best.text };
    };
    type Group = { session_id: string; text: string | null; items: Row[] };
    const groups = new Map<string, Group>();
    for (const t of turns) {
      const p = promptOf(t.session_id, t.t_start);
      const g = groups.get(p.key) ?? { session_id: t.session_id, text: p.text, items: [] };
      g.items.push(t);
      groups.set(p.key, g);
    }
    const msgOf = new Map<SubagentTask, string>();
    for (const g of groups.values()) {
      const starts = g.items.map((t) => norm(t.t_start));
      const startedAt = Math.min(...starts);
      const ends = g.items.filter((t) => t.t_end != null).map((t) => norm(t.t_end as number));
      const running = ends.length < g.items.length;
      const endedAt = running ? null : Math.max(...ends);
      const list = out.get(g.session_id) ?? [];
      const promptText = (g.text ?? "").replace(/\s+/g, " ").trim();
      const entry: SubagentTask = {
        childSessionId: null,
        parentSessionId: g.session_id,
        agent: "main",
        description: promptText.slice(0, 500),
        status: running ? "running" : "completed",
        startedAt,
        endedAt,
        durationMs: running || endedAt == null ? null : Math.max(0, endedAt - startedAt),
        title: g.text ? g.text.replace(/\s+/g, " ").trim().slice(0, 80) : "thinking main",
        report: null,
        errorText: null,
        truncated: false,
        tools: [],
        tokens: null,
      };
      list.push(entry);
      // msg paling awal grup untuk fallback judul tool pertama.
      const firstMid = [...g.items].sort((a, b) => a.t_start - b.t_start)[0].msg_id;
      msgOf.set(entry, firstMid);
      out.set(g.session_id, list);
    }
    for (const [k, list] of out) {
      // Running (endedAt null) selalu di atas, lalu startedAt DESC, cap 50.
      list.sort((a, b) => (a.endedAt == null ? -1 : b.endedAt == null ? 1 : 0) || b.startedAt - a.startedAt);
      out.set(k, list.slice(0, 50));
    }
    // Fallback: turn tanpa prompt user (mis. lanjutan compaction) memakai
    // tool pertama turn + detailnya; turn tanpa tool tetap "thinking main".
    const msgIds = [...new Set(msgOf.values())];
    for (let i = 0; i < msgIds.length; i += 200) {
      const chunk = msgIds.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const parts = db
        .prepare(
          `SELECT message_id AS msg_id,
                  json_extract(data, '$.tool') AS tool,
                  COALESCE(
                    json_extract(data, '$.state.input.command'),
                    json_extract(data, '$.state.input.pattern'),
                    json_extract(data, '$.state.input.description'),
                    json_extract(data, '$.state.input.url'),
                    json_extract(data, '$.state.input.filePath'),
                    json_extract(data, '$.state.metadata.filepath')
                  ) AS detail
             FROM part
            WHERE message_id IN (${placeholders})
              AND json_extract(data, '$.tool') IS NOT NULL
              AND json_extract(data, '$.tool') != 'task'
              AND json_extract(data, '$.state.status') IS NOT NULL
            ORDER BY time_created ASC`,
        )
        .all(...chunk) as { msg_id: string; tool: string; detail: string | null }[];
      const first = new Map<string, { tool: string; detail: string | null }>();
      for (const p of parts) {
        if (!first.has(p.msg_id)) first.set(p.msg_id, { tool: p.tool, detail: p.detail });
      }
      for (const [entry, mid] of msgOf) {
        if (entry.title !== "thinking main") continue; // sudah berjudul prompt
        const f = first.get(mid);
        if (!f) continue;
        const d = (f.detail ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
        entry.title = d ? `${f.tool} ${d}` : f.tool;
        if (!entry.description && d) entry.description = d ? `${f.tool} ${d}` : f.tool;
      }
    }
    // Enrichment main agar setara subagent (tokens/tools/report tercatat,
    // bukan "—" / "tanpa deskripsi"): bucket per grup prompt dari part milik
    // sesi top-level itu sendiri dalam window [startedAt, endedAt ?? now].
    // - tokens: SUM($.tokens.total) part step-finish per window (0 bila nihil).
    // - tools: DISTINCT $.tool (kecuali 'task') per window, cap 50.
    // - report: gabungan $.text (type=text) per window, cap 5000 char;
    //   kosong → null agar Inspector fallback ke description (prompt).
    // Fail-open: gagal → entri tetap tampil apa adanya (tanpa enrichment).
    try {
      const sessIds = [...out.keys()];
      const nowMs = Date.now();
      const wins = new Map<string, { entry: SubagentTask; start: number; end: number }[]>();
      for (const [sid, list] of out) {
        wins.set(
          sid,
          list.map((entry) => ({
            entry,
            start: entry.startedAt,
            end: entry.endedAt ?? nowMs,
          })),
        );
      }
      const hit = (sid: string, t: number): SubagentTask | null => {
        const arr = wins.get(sid);
        if (!arr) return null;
        for (const w of arr) {
          if (t >= w.start && t <= w.end) return w.entry;
        }
        return null;
      };
      for (let i = 0; i < sessIds.length; i += 20) {
        const chunk = sessIds.slice(i, i + 20);
        const placeholders = chunk.map(() => "?").join(",");
        const toolRows = db
          .prepare(
            `SELECT session_id AS sid,
                    time_created AS tc,
                    json_extract(data, '$.tool') AS tool
               FROM part
              WHERE session_id IN (${placeholders})
                AND json_extract(data, '$.tool') IS NOT NULL
                AND json_extract(data, '$.tool') != 'task'
                AND json_extract(data, '$.state.status') IS NOT NULL`,
          )
          .all(...chunk) as { sid: string; tc: number; tool: string }[];
        for (const r of toolRows) {
          if (!r.tool) continue;
          const e = hit(r.sid, norm(r.tc));
          if (!e || e.tools.includes(r.tool)) continue;
          if (e.tools.length < 50) e.tools.push(r.tool);
        }
        const tokRows = db
          .prepare(
            `SELECT session_id AS sid,
                    time_created AS tc,
                    CAST(json_extract(data, '$.tokens.total') AS INTEGER) AS total
               FROM part
              WHERE session_id IN (${placeholders})
                AND json_extract(data, '$.type') = 'step-finish'`,
          )
          .all(...chunk) as { sid: string; tc: number; total: number | null }[];
        for (const r of tokRows) {
          const e = hit(r.sid, norm(r.tc));
          if (!e) continue;
          e.tokens = (e.tokens ?? 0) + (r.total ?? 0);
        }
        const txtRows = db
          .prepare(
            `SELECT session_id AS sid,
                    time_created AS tc,
                    json_extract(data, '$.text') AS txt
               FROM part
              WHERE session_id IN (${placeholders})
                AND json_extract(data, '$.type') = 'text'
              ORDER BY time_created ASC`,
          )
          .all(...chunk) as { sid: string; tc: number; txt: string | null }[];
        for (const r of txtRows) {
          const t = (r.txt ?? "").replace(/\s+/g, " ").trim();
          if (!t) continue;
          const e = hit(r.sid, norm(r.tc));
          if (!e) continue;
          const cur = e.report ?? "";
          if (cur.length >= 5000) continue;
          const add = cur ? ` ${t}` : t;
          e.report = (cur + add).slice(0, 5000);
        }
      }
      for (const [, list] of out) {
        for (const e of list) {
          if (e.tokens == null) e.tokens = 0;
          if (!e.report) e.report = null;
        }
      }
    } catch {
      /* abaikan — entri main tetap tampil tanpa enrichment */
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
      t_end: number | null;
      t_updated: number;
      file_path: string | null;
      command: string | null;
      pattern: string | null;
      in_path: string | null;
      description: string | null;
      url: string | null;
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
             CAST(json_extract(p.data, '$.state.time.end') AS INTEGER) AS t_end,
             p.time_updated AS t_updated,
             COALESCE(
               json_extract(p.data, '$.state.input.filePath'),
               json_extract(p.data, '$.state.metadata.filepath')
             ) AS file_path,
             json_extract(p.data, '$.state.input.command') AS command,
             json_extract(p.data, '$.state.input.pattern') AS pattern,
             json_extract(p.data, '$.state.input.path') AS in_path,
             json_extract(p.data, '$.state.input.description') AS description,
             json_extract(p.data, '$.state.input.url') AS url
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
        // Durasi hanya kalau `end > start` (ms) setelah dinormalisasi.
        const durationMs =
          r.t_end && at ? Math.max(0, norm(r.t_end) - at) || null : null;
        const detail = firstText(
          r.command,
          r.pattern ? [r.pattern, r.in_path].filter(Boolean).join(" ") : null,
          r.description,
          r.url,
          r.file_path,
        );
        const root = rootOf(r.session_id);
        const list = out.get(root) ?? [];
        list.push({
          sessionId: r.session_id,
          tool: r.tool,
          status: st as ToolEvent["status"],
          at,
          filePath: r.file_path ?? null,
          detail,
          durationMs,
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

// Model terakhir per root sesi, dari pesan assistant di root maupun descendants.
// Tidak difilter provider agar 9router dan provider lain ikut terwakili.
export function getSessionModels(parentIds: string[]): Map<string, SessionModel> | null {
  const want = new Set(parentIds);
  const out = new Map<string, SessionModel>();
  if (want.size === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const parentOf = new Map<string, string | null>();
    const sessions = db.prepare("SELECT id, parent_id FROM session").all() as {
      id: string;
      parent_id: string | null;
    }[];
    for (const s of sessions) parentOf.set(s.id, s.parent_id);
    const rootOf = (id: string): string => {
      let cur = id;
      const seen = new Set([cur]);
      for (;;) {
        const parent = parentOf.get(cur);
        if (!parent || seen.has(parent)) return cur;
        seen.add(parent);
        cur = parent;
      }
    };
    const relevantIds = sessions.map((s) => s.id).filter((id) => want.has(rootOf(id)));
    const query = db.prepare(
      `SELECT session_id, time_created,
              json_extract(data, '$.modelID') AS model,
              json_extract(data, '$.providerID') AS provider
         FROM message
        WHERE session_id IN (SELECT value FROM json_each(?))
          AND json_extract(data, '$.role') = 'assistant'
          AND json_extract(data, '$.modelID') IS NOT NULL
        ORDER BY time_created DESC`,
    );
    const rows = query.all(JSON.stringify(relevantIds)) as {
      session_id: string;
      time_created: number;
      model: string;
      provider: string | null;
    }[];
    for (const r of rows) {
      const root = rootOf(r.session_id);
      if (!want.has(root) || out.has(root)) continue;
      out.set(root, {
        model: r.model,
        provider: r.provider ?? "unknown",
        at: norm(r.time_created),
      });
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

// Agregat token global — sumber metrik overview tetap providerID='opencode' saja.
// Breakdown token per sesi mengikutsertakan semua provider supaya kartu juga
// menunjukkan model dari penyedia eksternal (mis. 9router). JANGAN tambah part
// `step-finish`: angkanya duplikat message.
// - daily: 7 hari terakhir (date dari time_created ms), ASC untuk sparkline.
// - byModel: GROUP BY modelID+providerID (hasil sudah pasti opencode saja),
//   cap 10, sort total DESC.
// - bySession: per root semua provider (roll-up subtree), breakdown model/provider,
//   sort total DESC, tanpa cap. Total sesi bisa berbeda dari overview provider bawaan.
// - cost selalu 0 (free tier) → tidak diexpose.
// - Fail-open: DB gagal → null (route menghilangkan field agar klien sticky).
export function getTokenStats(): TokenStats | null {
  const db = openDb();
  if (!db) return null;
  try {
    // Filter bawaan opencode — satu tempat, semua query di bawah ikut.
    const ONLY_BUILTIN = `json_extract(data, '$.role') = 'assistant' AND json_extract(data, '$.providerID') = 'opencode'`;
    const total = db
      .prepare(
        `SELECT
           SUM(CAST(json_extract(data, '$.tokens.total') AS INTEGER)) AS total,
           SUM(CAST(json_extract(data, '$.tokens.input') AS INTEGER)) AS input,
           SUM(CAST(json_extract(data, '$.tokens.output') AS INTEGER)) AS output
           FROM message
          WHERE ${ONLY_BUILTIN}`,
      )
      .get() as { total: number | null; input: number | null; output: number | null };
    const dailyRows = db
      .prepare(
        `SELECT
           date(time_created / 1000, 'unixepoch') AS date,
           SUM(CAST(json_extract(data, '$.tokens.total') AS INTEGER)) AS total,
           SUM(CAST(json_extract(data, '$.tokens.input') AS INTEGER)) AS input,
           SUM(CAST(json_extract(data, '$.tokens.output') AS INTEGER)) AS output
           FROM message
          WHERE ${ONLY_BUILTIN}
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT 7`,
      )
      .all() as { date: string; total: number | null; input: number | null; output: number | null }[];
    const modelRows = db
      .prepare(
        `SELECT
           json_extract(data, '$.modelID') AS model,
           json_extract(data, '$.providerID') AS provider,
           COUNT(*) AS count,
           SUM(CAST(json_extract(data, '$.tokens.total') AS INTEGER)) AS total
           FROM message
          WHERE ${ONLY_BUILTIN}
          GROUP BY 1, 2
          ORDER BY total DESC
          LIMIT 10`,
      )
      .all() as { model: string | null; provider: string | null; count: number; total: number | null }[];
    const daily: TokenDaily[] = dailyRows
      .map((r) => ({
        date: r.date,
        total: r.total ?? 0,
        input: r.input ?? 0,
        output: r.output ?? 0,
      }))
      .reverse();
    const byModel: TokenByModel[] = modelRows
      .filter((r) => r.model != null)
      .map((r) => ({
        model: r.model ?? "unknown",
        provider: r.provider ?? "unknown",
        count: r.count,
        total: r.total ?? 0,
      }));
    // Per-sesi: agregat per session_id lalu roll-up subtree ke root via
    // parent_id (pola rootOf yang sama dipakai getTaskHistory dkk).
    // Kolom session.tokens_* TIDAK dipakai: terbukti under-count ±10x
    // dibanding agregat message (241k vs 2.8M pada satu sesi).
    const sessRows = db
      .prepare(
        `SELECT
           session_id AS session,
           SUM(CAST(json_extract(data, '$.tokens.total') AS INTEGER)) AS total,
           SUM(CAST(json_extract(data, '$.tokens.input') AS INTEGER)) AS input,
           SUM(CAST(json_extract(data, '$.tokens.output') AS INTEGER)) AS output
           FROM message
          WHERE json_extract(data, '$.role') = 'assistant'
          GROUP BY 1`,
      )
      .all() as { session: string; total: number | null; input: number | null; output: number | null }[];
    const modelSessionRows = db
      .prepare(
        `SELECT
           session_id AS session,
           json_extract(data, '$.modelID') AS model,
           json_extract(data, '$.providerID') AS provider,
           SUM(CAST(json_extract(data, '$.tokens.total') AS INTEGER)) AS total,
           SUM(CAST(json_extract(data, '$.tokens.input') AS INTEGER)) AS input,
            SUM(CAST(json_extract(data, '$.tokens.output') AS INTEGER)) AS output
           FROM message
          WHERE json_extract(data, '$.role') = 'assistant'
            AND json_extract(data, '$.modelID') IS NOT NULL
          GROUP BY 1, 2, 3`,
      )
      .all() as {
      session: string;
      model: string;
      provider: string | null;
      total: number | null;
      input: number | null;
      output: number | null;
    }[];
    const sess = db.prepare("SELECT id, parent_id FROM session").all() as {
      id: string;
      parent_id: string | null;
    }[];
    const parentOf = new Map<string, string | null>();
    for (const s of sess) parentOf.set(s.id, s.parent_id);
    const rootOf = (id: string): string => {
      let cur = id;
      const seen = new Set<string>([cur]);
      for (;;) {
        const p = parentOf.get(cur);
        if (!p || seen.has(p)) return cur;
        seen.add(p);
        cur = p;
      }
    };
    const byRoot = new Map<string, { total: number; input: number; output: number }>();
    for (const r of sessRows) {
      const root = rootOf(r.session);
      const cur = byRoot.get(root) ?? { total: 0, input: 0, output: 0 };
      cur.total += r.total ?? 0;
      cur.input += r.input ?? 0;
      cur.output += r.output ?? 0;
      byRoot.set(root, cur);
    }
    const modelByRoot = new Map<string, Map<string, SessionModelTokens>>();
    for (const r of modelSessionRows) {
      const root = rootOf(r.session);
      const model = r.model.trim();
      const provider = r.provider ?? "unknown";
      const bucket = modelByRoot.get(root) ?? new Map<string, SessionModelTokens>();
      const key = `${model}\u0000${provider}`;
      const cur = bucket.get(key) ?? { model, provider, total: 0, input: 0, output: 0 };
      cur.total += r.total ?? 0;
      cur.input += r.input ?? 0;
      cur.output += r.output ?? 0;
      bucket.set(key, cur);
      modelByRoot.set(root, bucket);
    }
    const bySession: TokenSession[] = [...byRoot.entries()]
      .map(([session, t]) => ({
        session,
        ...t,
        models: [...(modelByRoot.get(session)?.values() ?? [])].sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
    return {
      total: total.total ?? 0,
      input: total.input ?? 0,
      output: total.output ?? 0,
      daily,
      byModel,
      bySession,
    };
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {}
  }
}
