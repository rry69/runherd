import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { HERMES_IDLE_MS } from "./live-status";
import type {
  ActiveChild,
  ChangedFile,
  SessionModel,
  SessionModelTokens,
  SessionRow,
  SubagentTask,
  TokenSession,
  ToolEvent,
} from "./types";

// Adapter Hermes Agent — mirror lib/opencode-db.ts untuk state.db Hermes.
// - Sumber: <HERMES_HOME>/state.db (default %LOCALAPPDATA%\hermes\state.db),
//   readonly + fail-open null, tanpa pernah menulis (pola sama opencode-db).
// - Waktu Hermes = epoch DETIK float → dikali 1000 ke ms di sini agar
//   downstream (route, kanban) menerima ms seperti dari opencode.
// - Taksonomi lineage meniru hermes_state_common.py:
//   listable (kartu kanban) = root + branch (_branched_from) + reset
//   (_reset_from); delegate (_delegate_from) = subagent run; compression =
//   lanjutan (parent end_reason='compression'). Anak listable di-re-root
//   (parent_id → null) supaya tampil sebagai kartu sendiri seperti picker
//   Hermes; aktivitas anak me-roll-up ke listable ancestor terdekat.
// - Thinking = ended_at NULL (sesi terbuka), ikut ambang opencode di route
//   (5 mnt part / 15 mnt live) — sesi terbuka yang basi → failed, jujur
//   seperti turn opencode yang crash.
// - Token = kolom agregat sessions (input_tokens/output_tokens, terverifikasi
//   message_count-nya eksak) — tanpa scan 52rb messages.
// - Per-entry tokens main/thinking = null: skema Hermes tidak menyimpan token
//   per turn (hanya agregat sesi + session_model_usage per model).

const DEFAULT_HOME = String.raw`C:\Users\Hrry\AppData\Local\hermes`;
const SRC = process.env.HERMES_HOME
  ? join(process.env.HERMES_HOME, "state.db")
  : join(DEFAULT_HOME, "state.db");

export const HERMES_SOURCE = "hermes" as const;

export type HermesSessionRow = SessionRow & { source: typeof HERMES_SOURCE };

// Marker lineage (kunci JSON di kolom model_config) — dievaluasi di JS
// (lihat isListable/isDelegate), bukan di SQL.

function norm(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

function firstText(...xs: (string | null | undefined)[]): string | null {
  for (const x of xs) {
    const s = typeof x === "string" ? x.trim() : "";
    if (s) return s;
  }
  return null;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function openDb(): Database.Database | null {
  try {
    if (!existsSync(SRC)) return null;
    return new Database(SRC, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

type Lineage = {
  parentOf: Map<string, string | null>;
  listable: Set<string>;
  childrenOf: Map<string, string[]>;
};

function loadLineage(db: Database.Database): Lineage {
  const rows = db
    .prepare(
      `SELECT s.id AS id, s.parent_session_id AS parent_id,
              s.model_config AS model_config, p.end_reason AS parent_end
         FROM sessions s LEFT JOIN sessions p ON p.id = s.parent_session_id`,
    )
    .all() as {
    id: string;
    parent_id: string | null;
    model_config: string | null;
    parent_end: string | null;
  }[];
  // Listable dihitung di JS (mirror _LISTABLE_CHILD_SQL): root + branch +
  // reset. Marker dibaca per baris agar tak bergantung pada json_extract
  // di WHERE yang rapuh lintas versi SQLite.
  const parentOf = new Map<string, string | null>();
  const listable = new Set<string>();
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    parentOf.set(r.id, r.parent_id);
    if (isListable(r.parent_id, r.model_config, r.parent_end)) listable.add(r.id);
    if (r.parent_id != null) {
      const list = childrenOf.get(r.parent_id) ?? [];
      list.push(r.id);
      childrenOf.set(r.parent_id, list);
    }
  }
  return { parentOf, listable, childrenOf };
}

function cfgHas(model_config: string | null, key: string): boolean {
  if (!model_config) return false;
  try {
    const d = JSON.parse(model_config) as unknown;
    return d != null && typeof d === "object" && key in (d as Record<string, unknown>);
  } catch {
    return model_config.includes(`"${key}"`);
  }
}

// Mirror _BRANCH_CHILD_SQL / _RESET_CHILD_SQL (marker + heuristik legacy).
function isListable(
  parent_id: string | null,
  model_config: string | null,
  parent_end: string | null,
): boolean {
  if (parent_id == null) return true;
  if (cfgHas(model_config, "_branched_from")) return true;
  if (cfgHas(model_config, "_reset_from")) return true;
  if (parent_end === "branched") return true; // legacy branch
  if (parent_end != null && RESET_END.has(parent_end)) return true; // legacy reset
  return false;
}

const RESET_END = new Set([
  "session_reset",
  "session_switch",
  "idle",
  "daily",
  "suspended",
  "resume_pending_expired",
]);

// Mirror _ephemeral_child (delegate): anak yang BUKAN branch/reset/kompresi.
function isDelegate(parent_id: string | null, model_config: string | null, parent_end: string | null): boolean {
  if (parent_id == null) return false;
  if (cfgHas(model_config, "_delegate_from")) return true;
  if (isListable(parent_id, model_config, parent_end)) return false;
  if (parent_end === "compression") return false;
  return true;
}

// Leluhur listable terdekat (dirinya sendiri bila listable); siklus diputus.
function ancestorOf(lin: Lineage, id: string): string {
  let cur = id;
  const seen = new Set([cur]);
  for (;;) {
    if (lin.listable.has(cur)) return cur;
    const p = lin.parentOf.get(cur);
    if (!p || seen.has(p)) return cur;
    seen.add(p);
    cur = p;
  }
}

// Kandidat = parentIds + seluruh keturunan (depth berapa pun).
function candidates(lin: Lineage, parentIds: string[]): Set<string> {
  const cand = new Set<string>(parentIds);
  const stack = [...parentIds];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const c of lin.childrenOf.get(cur) ?? []) {
      if (!cand.has(c)) {
        cand.add(c);
        stack.push(c);
      }
    }
  }
  return cand;
}

// Judul: title kolom → preview pesan user pertama → display_name → id.
// (Preview bisa berawalan "[System: ..." — sama seperti picker Hermes yang
// memakai pesan user pertama.)
const TITLE_SQL = `COALESCE(NULLIF(TRIM(s.title), ''),
  (SELECT SUBSTR(m.content, 1, 120) FROM messages m
    WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
    ORDER BY m.timestamp, m.id LIMIT 1),
  NULLIF(TRIM(s.display_name), ''), s.id)`;

const TIME_MS_SQL = `CAST(ROUND(COALESCE(s.last_activity_at, s.ended_at, s.started_at, 0) * 1000) AS INTEGER)`;

export function getHermesSessions(limit = 200): HermesSessionRow[] {
  const db = openDb();
  if (!db) throw new Error("gagal membuka DB hermes");
  try {
    const lin = loadLineage(db);
    const rows = db
      .prepare(
        `SELECT s.id AS id,
                COALESCE(NULLIF(TRIM(s.git_repo_root), ''), NULLIF(TRIM(s.cwd), ''), '') AS directory,
                ${TITLE_SQL} AS title,
                COALESCE(NULLIF(TRIM(s.model), ''), NULLIF(TRIM(s.source), ''), 'hermes') AS agent,
                ${TIME_MS_SQL} AS time_updated
           FROM sessions s
          WHERE COALESCE(s.archived, 0) = 0 AND COALESCE(s.hidden, 0) = 0
          ORDER BY COALESCE(s.last_activity_at, s.ended_at, s.started_at, 0) DESC`,
      )
      .all() as {
      id: string;
      directory: string;
      title: string | null;
      agent: string;
      time_updated: number;
    }[];
    return rows
      .filter((r) => lin.listable.has(r.id))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        parent_id: null,
        directory: r.directory ?? "",
        title: r.title ?? r.id,
        agent: r.agent,
        time_updated: r.time_updated,
        source: HERMES_SOURCE,
      }));
  } catch (e) {
    throw e instanceof Error ? e : new Error("gagal query sessions hermes");
  } finally {
    try {
      db.close();
    } catch {}
  }
}

// Jumlah sesi listable (roots + branch + reset, tanpa archived/hidden).
export function getHermesSessionCount(): number {
  const db = openDb();
  if (!db) throw new Error("gagal membuka DB hermes");
  try {
    const lin = loadLineage(db);
    const rows = db
      .prepare(
        `SELECT s.id AS id FROM sessions s
          WHERE COALESCE(s.archived, 0) = 0 AND COALESCE(s.hidden, 0) = 0`,
      )
      .all() as { id: string }[];
    let n = 0;
    for (const r of rows) {
      if (lin.listable.has(r.id)) n++;
    }
    return n;
  } catch (e) {
    throw e instanceof Error ? e : new Error("gagal hitung sessions hermes");
  } finally {
    try {
      db.close();
    } catch {}
  }
}

// Sesi terbuka per ancestor listable: 1 baris per sesi ended_at NULL
// (tool = tool result terakhir, tokens = agregat kolom).
export function getHermesActiveChildren(
  parentIds: string[],
  now = Date.now(),
): Map<string, ActiveChild[]> | null {
  const out = new Map<string, ActiveChild[]>();
  if (parentIds.length === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const lin = loadLineage(db);
    const want = new Set(parentIds);
    const cand = candidates(lin, parentIds.filter((id) => lin.parentOf.has(id)));
    const ids = [...cand];
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT s.id AS session_id,
                  COALESCE(NULLIF(TRIM(s.model), ''), NULLIF(TRIM(s.source), ''), 'hermes') AS agent,
                  ${TITLE_SQL} AS title,
                  COALESCE(s.input_tokens, 0) + COALESCE(s.output_tokens, 0) AS tokens,
                  ${TIME_MS_SQL} AS updated_at,
                  (SELECT m.tool_name FROM messages m
                    WHERE m.session_id = s.id AND m.role = 'tool' AND m.tool_name IS NOT NULL
                    ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS tool
             FROM sessions s
            WHERE s.id IN (${placeholders}) AND s.ended_at IS NULL`,
        )
        .all(...chunk) as {
        session_id: string;
        agent: string;
        title: string | null;
        tokens: number;
        updated_at: number;
        tool: string | null;
      }[];
      for (const r of rows) {
        // Opsi A: sesi terbuka tapi last_activity beku >90s = idle,
        // bukan thinking (Hermes tak punya sinyal completed per-turn).
        if (now - r.updated_at > HERMES_IDLE_MS) continue;
        const anc = ancestorOf(lin, r.session_id);
        if (!want.has(anc)) continue;
        const ck = `${anc}|${r.session_id}`;
        if (seen.has(ck)) continue;
        seen.add(ck);
        const list = out.get(anc) ?? [];
        list.push({
          sessionId: r.session_id,
          parentId: anc,
          agent: r.agent,
          title: r.title ?? r.session_id,
          partType: "message",
          tool: r.tool,
          tokens: r.tokens ?? 0,
          updatedAt: r.updated_at,
          ageMs: Math.max(0, now - r.updated_at),
        });
        out.set(anc, list);
      }
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

// Sinyal live: sesi listable yang terbuka → last_activity (ms).
// Opsi A: terbuka tapi idle >90s tidak dikirim (dianggap selesai jawab),
// agar tidak nempel `thinking` seperti opencode. Basi >15 mnt → failed
// di route (aturan opencode, sesuai kesepakatan).
export function getHermesLiveTurns(parentIds: string[], now = Date.now()): Map<string, number> | null {
  const want = new Set(parentIds);
  const out = new Map<string, number>();
  if (want.size === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const lin = loadLineage(db);
    const rows = db
      .prepare(
        `SELECT s.id AS id, ${TIME_MS_SQL} AS at
           FROM sessions s
          WHERE s.ended_at IS NULL`,
      )
      .all() as { id: string; at: number }[];
    for (const r of rows) {
      if (!want.has(r.id) || !lin.listable.has(r.id)) continue;
      // Opsi A: idle >90s = selesai jawab, jangan kirim sinyal live.
      if (now - r.at > HERMES_IDLE_MS) continue;
      const prev = out.get(r.id);
      if (prev == null || r.at > prev) out.set(r.id, r.at);
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

type DelegateRow = {
  id: string;
  parent_id: string | null;
  model: string | null;
  source: string | null;
  title: string | null;
  started_at: number | null;
  ended_at: number | null;
  end_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  preview: string | null;
};

// Riwayat subagent = anak delegate (_delegate_from; fallback: anak bukan
// branch/reset/kompresi) di bawah ancestor yang diminta. Status jujur:
// ended_at NULL → running; end_reason ./error/ → error; else completed.
export function getHermesTaskHistory(
  parentIds: string[],
): Map<string, SubagentTask[]> | null {
  const out = new Map<string, SubagentTask[]>();
  if (parentIds.length === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const lin = loadLineage(db);
    const want = new Set(parentIds);
    const cand = candidates(lin, parentIds.filter((id) => lin.parentOf.has(id)));
    // end_reason parent untuk klasifikasi delegate (kompresi) di JS.
    const pEnds = new Map<string, string | null>();
    {
      const all = [...cand];
      for (let i = 0; i < all.length; i += 500) {
        const chunk = all.slice(i, i + 500);
        const placeholders = chunk.map(() => "?").join(",");
        const er = db
          .prepare(`SELECT id, end_reason FROM sessions WHERE id IN (${placeholders})`)
          .all(...chunk) as { id: string; end_reason: string | null }[];
        for (const r of er) pEnds.set(r.id, r.end_reason);
      }
    }
    const ids = [...cand];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT s.id AS id,
                  s.parent_session_id AS parent_id,
                  s.model AS model,
                  s.source AS source,
                  NULLIF(TRIM(s.title), '') AS title,
                  s.started_at AS started_at,
                  s.ended_at AS ended_at,
                  s.end_reason AS end_reason,
                  s.input_tokens AS input_tokens,
                  s.output_tokens AS output_tokens,
                  s.model_config AS model_config,
                  (SELECT SUBSTR(m.content, 1, 500) FROM messages m
                    WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
                    ORDER BY m.timestamp, m.id LIMIT 1) AS preview
             FROM sessions s
            WHERE s.id IN (${placeholders})
              AND s.parent_session_id IS NOT NULL`,
        )
        .all(...chunk) as (DelegateRow & { model_config: string | null })[];
      for (const r of rows) {
        if (!isDelegate(r.parent_id, r.model_config, pEnds.get(r.parent_id ?? "") ?? null)) continue;
        const anc = ancestorOf(lin, r.id);
        if (!want.has(anc)) continue;
        const startedAt = r.started_at != null ? norm(r.started_at) : 0;
        const endedAt = r.ended_at != null ? norm(r.ended_at) : null;
        const status =
          endedAt == null ? "running" : /error/i.test(r.end_reason ?? "") ? "error" : "completed";
        const desc = firstText(r.title, r.preview) ?? r.id;
        const list = out.get(anc) ?? [];
        list.push({
          childSessionId: r.id,
          parentSessionId: r.parent_id,
          agent: firstText(r.model, r.source) ?? "unknown",
          description: clean(desc).slice(0, 500),
          status,
          startedAt,
          endedAt,
          durationMs: endedAt != null ? Math.max(0, endedAt - startedAt) : null,
          title: clean(firstText(r.title, r.preview) ?? r.id).slice(0, 80),
          report: null,
          errorText: null,
          truncated: false,
          tools: [],
          tokens: (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
        });
        out.set(anc, list);
      }
    }
    // Tools per delegate child: DISTINCT tool_name (cap 50).
    const childIds = [...new Set([...out.values()].flatMap((l) => l.map((t) => t.childSessionId!)))];
    for (let i = 0; i < childIds.length; i += 200) {
      const chunk = childIds.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT m.session_id AS sid, m.tool_name AS tool
             FROM messages m
            WHERE m.session_id IN (${placeholders}) AND m.role = 'tool' AND m.tool_name IS NOT NULL
            GROUP BY m.session_id, m.tool_name`,
        )
        .all(...chunk) as { sid: string; tool: string }[];
      const byChild = new Map<string, string[]>();
      for (const r of rows) {
        const list = byChild.get(r.sid) ?? [];
        if (!list.includes(r.tool) && list.length < 50) list.push(r.tool);
        byChild.set(r.sid, list);
      }
      for (const list of out.values()) {
        for (const t of list) {
          if (t.childSessionId && byChild.has(t.childSessionId)) {
            t.tools = byChild.get(t.childSessionId) ?? [];
          }
        }
      }
    }
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

// Thinking main agent: turn assistant dikelompokkan per prompt user pemicu
// (1 prompt → 1 baris). report = gabungan konten assistant (cap 5000);
// tokens per entri = null (skema tak menyimpan token per turn).
export function getHermesMainThinkingHistory(
  parentIds: string[],
): Map<string, SubagentTask[]> | null {
  const out = new Map<string, SubagentTask[]>();
  if (parentIds.length === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const lin = loadLineage(db);
    const sessIds = parentIds.filter((id) => lin.parentOf.has(id) && lin.listable.has(id));
    if (sessIds.length === 0) return out;
    const openIds = new Set(
      (db.prepare(`SELECT id FROM sessions WHERE ended_at IS NULL`).all() as { id: string }[]).map(
        (r) => r.id,
      ),
    );
    for (let i = 0; i < sessIds.length; i += 50) {
      const chunk = sessIds.slice(i, i + 50);
      const placeholders = chunk.map(() => "?").join(",");
      const prompts = db
        .prepare(
          `SELECT m.session_id AS sid, m.timestamp AS ts, SUBSTR(m.content, 1, 500) AS text
             FROM messages m
            WHERE m.session_id IN (${placeholders}) AND m.role = 'user' AND m.content IS NOT NULL
            ORDER BY m.timestamp ASC, m.id ASC`,
        )
        .all(...chunk) as { sid: string; ts: number; text: string }[];
      const bySess = new Map<string, { ts: number; text: string }[]>();
      for (const p of prompts) {
        const arr = bySess.get(p.sid) ?? [];
        arr.push({ ts: norm(p.ts), text: p.text });
        bySess.set(p.sid, arr);
      }
      const turns = db
        .prepare(
          `SELECT m.session_id AS sid, m.timestamp AS ts, COALESCE(m.content, '') AS content,
                  m.tool_name AS tool_name, m.tool_calls AS tool_calls
             FROM messages m
            WHERE m.session_id IN (${placeholders}) AND m.role = 'assistant'
            ORDER BY m.timestamp ASC, m.id ASC`,
        )
        .all(...chunk) as {
        sid: string;
        ts: number;
        content: string;
        tool_name: string | null;
        tool_calls: string | null;
      }[];
      type Group = { sid: string; text: string | null; key: string; items: typeof turns };
      const groups = new Map<string, Group>();
      for (const t of turns) {
        const arr = bySess.get(t.sid) ?? [];
        const tms = norm(t.ts);
        let best: { ts: number; text: string } | null = null;
        for (const u of arr) {
          if (u.ts <= tms) best = u;
          else break;
        }
        const key = best ? `prompt|${t.sid}|${best.ts}` : `turn|${t.sid}|${tms}`;
        const g = groups.get(key) ?? { sid: t.sid, text: best?.text ?? null, key, items: [] };
        g.items.push(t);
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const starts = g.items.map((t) => norm(t.ts));
        const startedAt = Math.min(...starts);
        const endedAt = Math.max(...starts);
        const promptText = g.text ? clean(g.text) : "";
        const tools: string[] = [];
        let report = "";
        for (const t of g.items) {
          const c = clean(t.content);
          if (c) report = (report ? `${report} ` : "") + c;
          if (report.length >= 5000) break;
        }
        report = report.slice(0, 5000);
        for (const t of g.items) {
          for (const name of toolNamesOf(t.tool_calls)) {
            if (!tools.includes(name) && tools.length < 50) tools.push(name);
          }
        }
        // running = sesi masih terbuka DAN grup ini memuat aktivitas terakhir
        // DAN aktivitas < 90 detik (idle-timeout Hermes, opsi A).
        const isOpen = openIds.has(g.sid);
        const recent = Date.now() - endedAt < HERMES_IDLE_MS;
        const running = isOpen && recent;
        const list = out.get(g.sid) ?? [];
        list.push({
          childSessionId: null,
          parentSessionId: g.sid,
          agent: "main",
          description: promptText.slice(0, 500),
          status: running ? "running" : "completed",
          startedAt,
          endedAt: running ? null : endedAt,
          durationMs: running ? null : Math.max(0, endedAt - startedAt),
          title: promptText ? promptText.slice(0, 80) : "thinking main",
          report: report || null,
          errorText: null,
          truncated: false,
          tools,
          tokens: null,
        });
        out.set(g.sid, list);
      }
    }
    for (const [k, list] of out) {
      list.sort((a, b) => (a.endedAt == null ? -1 : b.endedAt == null ? 1 : 0) || b.startedAt - a.startedAt);
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

// Nama tool dari kolom tool_calls (JSON array [{function:{name,arguments}}]).
function toolNamesOf(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const names: string[] = [];
    for (const c of arr) {
      const n =
        c != null && typeof c === "object" && "function" in c
          ? (c as { function?: { name?: unknown } }).function?.name
          : null;
      if (typeof n === "string" && n && !names.includes(n)) names.push(n);
    }
    return names;
  } catch {
    return [];
  }
}

type ToolCall = { id: string; name: string; args: Record<string, unknown>; ts: number; sid: string };

function toolCallsOf(raw: string | null, ts: number, sid: string): ToolCall[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const calls: ToolCall[] = [];
    for (const c of arr) {
      if (c == null || typeof c !== "object") continue;
      const o = c as { id?: unknown; call_id?: unknown; function?: { name?: unknown; arguments?: unknown } };
      const id = typeof o.id === "string" ? o.id : typeof o.call_id === "string" ? o.call_id : null;
      const name = o.function?.name;
      if (!id || typeof name !== "string" || !name) continue;
      let args: Record<string, unknown> = {};
      if (typeof o.function?.arguments === "string") {
        try {
          const parsed = JSON.parse(o.function.arguments) as unknown;
          if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {}
      }
      calls.push({ id, name, args, ts: norm(ts), sid });
    }
    return calls;
  } catch {
    return [];
  }
}

function argText(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

// Ringkasan argumen tool (command/pattern/path/query/...) untuk kolom detail.
function summarizeArgs(name: string, args: Record<string, unknown>): string | null {
  void name;
  return firstText(
    argText(args.command),
    args.pattern != null
      ? [argText(args.pattern), argText(args.path) ?? argText(args.cwd)].filter(Boolean).join(" ")
      : null,
    argText(args.description),
    argText(args.query),
    argText(args.question),
    argText(args.url),
    argText(args.path),
    argText(args.filePath),
    argText(args.file),
  );
}

function argPath(args: Record<string, unknown>): string | null {
  for (const k of ["path", "filePath", "file", "resolved_path", "filepath"]) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// Riwayat tool: baris role='tool' = completed/error (dari JSON result);
// tool_calls assistant tanpa hasil di sesi terbuka = running.
export function getHermesToolHistory(parentIds: string[]): Map<string, ToolEvent[]> | null {
  const out = new Map<string, ToolEvent[]>();
  if (parentIds.length === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const lin = loadLineage(db);
    const want = new Set(parentIds);
    const cand = candidates(lin, parentIds.filter((id) => lin.parentOf.has(id)));
    const sessMeta = new Map<string, { model: string; listable: boolean }>();
    const ids = [...cand];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const meta = db
        .prepare(
          `SELECT id, COALESCE(NULLIF(TRIM(model), ''), 'unknown') AS model FROM sessions WHERE id IN (${placeholders})`,
        )
        .all(...chunk) as { id: string; model: string }[];
      for (const m of meta) sessMeta.set(m.id, { model: m.model, listable: lin.listable.has(m.id) });
    }
    // Peta tool_call_id → panggilan assistant (untuk filePath/detail/durasi).
    const calls = new Map<string, ToolCall>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT session_id AS sid, timestamp AS ts, tool_calls AS tc
             FROM messages
            WHERE session_id IN (${placeholders}) AND role = 'assistant' AND tool_calls IS NOT NULL`,
        )
        .all(...chunk) as { sid: string; ts: number; tc: string | null }[];
      for (const r of rows) {
        for (const c of toolCallsOf(r.tc, r.ts, r.sid)) {
          if (!calls.has(c.id)) calls.set(c.id, c);
        }
      }
    }
    const openIds = new Set(
      (db.prepare(`SELECT id FROM sessions WHERE ended_at IS NULL`).all() as { id: string }[]).map(
        (r) => r.id,
      ),
    );
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT session_id AS sid, tool_name AS tool, tool_call_id AS tcid,
                  timestamp AS ts, COALESCE(content, '') AS content
             FROM messages
            WHERE session_id IN (${placeholders}) AND role = 'tool'
            ORDER BY timestamp DESC, id DESC`,
        )
        .all(...chunk) as {
        sid: string;
        tool: string | null;
        tcid: string | null;
        ts: number;
        content: string;
      }[];
      for (const r of rows) {
        if (!r.tool) continue;
        const call = (r.tcid && calls.get(r.tcid)) ?? null;
        const at = norm(r.ts);
        const result = parseToolResult(r.content);
        const filePath = call ? argPath(call.args) : null;
        const detail = firstText(
          call ? summarizeArgs(call.name, call.args) : null,
          result.detail,
          filePath,
        );
        const root = ancestorOf(lin, r.sid);
        if (!want.has(root)) continue;
        const meta = sessMeta.get(r.sid);
        const list = out.get(root) ?? [];
        list.push({
          sessionId: r.sid,
          tool: r.tool,
          status: result.error ? "error" : "completed",
          at,
          filePath,
          detail,
          durationMs: call && at >= call.ts ? (at - call.ts > 0 ? at - call.ts : null) : null,
          origin: meta?.listable ? "main" : "sub",
          agent: meta?.model ?? "unknown",
        });
        out.set(root, list);
      }
    }
    // Running: panggilan tanpa hasil di sesi terbuka.
    // Kumpulkan tcid yang sudah punya hasil.
    const resolved = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT DISTINCT tool_call_id AS tcid FROM messages
            WHERE session_id IN (${placeholders}) AND role = 'tool' AND tool_call_id IS NOT NULL`,
        )
        .all(...chunk) as { tcid: string }[];
      for (const r of rows) resolved.add(r.tcid);
    }
    for (const c of calls.values()) {
      if (resolved.has(c.id) || !openIds.has(c.sid)) continue;
      const root = ancestorOf(lin, c.sid);
      if (!want.has(root)) continue;
      const meta = sessMeta.get(c.sid);
      const filePath = argPath(c.args);
      const list = out.get(root) ?? [];
      list.push({
        sessionId: c.sid,
        tool: c.name,
        status: "running",
        at: c.ts,
        filePath,
        detail: firstText(summarizeArgs(c.name, c.args), filePath),
        durationMs: null,
        origin: meta?.listable ? "main" : "sub",
        agent: meta?.model ?? "unknown",
      });
      out.set(root, list);
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

function parseToolResult(content: string): { error: boolean; detail: string | null } {
  const text = content.trim();
  if (!text) return { error: false, detail: null };
  try {
    const d = JSON.parse(text) as unknown;
    if (d == null || typeof d !== "object" || Array.isArray(d)) {
      return { error: false, detail: clean(text).slice(0, 120) || null };
    }
    const o = d as Record<string, unknown>;
    const error =
      (typeof o.error === "string" && o.error.trim() !== "") ||
      o.success === false ||
      (typeof o.exit_code === "number" && o.exit_code !== 0);
    const detail = firstText(
      typeof o.output === "string" ? o.output : null,
      typeof o.message === "string" ? o.message : null,
      typeof o.error === "string" ? o.error : null,
      typeof o.diff === "string" ? `${o.diff.slice(0, 120)}` : null,
    );
    return { error, detail: detail ? clean(detail).slice(0, 120) : null };
  } catch {
    return { error: false, detail: clean(text).slice(0, 120) || null };
  }
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

const WRITE_TOOL = /write|patch|edit|apply|create/i;

// File berubah: path dari argumen tool_calls tulis + hitungan dari `diff`
// hasil `patch` bila ada; tanpa hitungan → 0/0 patch-list (UI menghitung 0).
export function getHermesChangedFiles(parentIds: string[]): Map<string, ChangedFile[]> | null {
  const perRoot = new Map<string, Map<string, ChangedFile>>();
  if (parentIds.length === 0) return new Map();
  const db = openDb();
  if (!db) return null;
  try {
    const lin = loadLineage(db);
    const want = new Set(parentIds);
    const cand = candidates(lin, parentIds.filter((id) => lin.parentOf.has(id)));
    const ids = [...cand];
    const calls: ToolCall[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT session_id AS sid, timestamp AS ts, tool_calls AS tc
             FROM messages
            WHERE session_id IN (${placeholders}) AND role = 'assistant' AND tool_calls IS NOT NULL`,
        )
        .all(...chunk) as { sid: string; ts: number; tc: string | null }[];
      for (const r of rows) {
        for (const c of toolCallsOf(r.tc, r.ts, r.sid)) {
          if (WRITE_TOOL.test(c.name) && argPath(c.args)) calls.push(c);
        }
      }
    }
    // Hasil per tool_call_id (untuk `diff` patch).
    const results = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT tool_call_id AS tcid, COALESCE(content, '') AS content
             FROM messages
            WHERE session_id IN (${placeholders}) AND role = 'tool' AND tool_call_id IS NOT NULL`,
        )
        .all(...chunk) as { tcid: string; content: string }[];
      for (const r of rows) {
        if (!results.has(r.tcid)) results.set(r.tcid, r.content);
      }
    }
    for (const c of calls) {
      const root = ancestorOf(lin, c.sid);
      if (!want.has(root)) continue;
      const file = argPath(c.args);
      if (!file) continue;
      let bucket = perRoot.get(root);
      if (!bucket) {
        bucket = new Map();
        perRoot.set(root, bucket);
      }
      let added = 0;
      let deleted = 0;
      let source: ChangedFile["source"] = "patch-list";
      const raw = results.get(c.id);
      if (raw) {
        try {
          const d = JSON.parse(raw) as { diff?: unknown };
          if (d && typeof d.diff === "string" && d.diff) {
            ({ added, deleted } = parsePatch(d.diff));
            source = "filediff";
          } else if (/^write/i.test(c.name)) {
            source = "write";
          }
        } catch {
          if (/^write/i.test(c.name)) source = "write";
        }
      } else if (/^write/i.test(c.name)) {
        source = "write";
      }
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

// Model dengan last_seen terbaru per sesi listable dari agregat
// session_model_usage, dengan fallback ke kolom sessions.model. Hermes tidak
// menyimpan model per message secara konsisten.
export function getHermesSessionModels(parentIds: string[]): Map<string, SessionModel> | null {
  const want = new Set(parentIds);
  const out = new Map<string, SessionModel>();
  if (want.size === 0) return out;
  const db = openDb();
  if (!db) return null;
  try {
    const lin = loadLineage(db);
    const usageRows = db
      .prepare(
        `SELECT u.session_id, u.model, u.billing_provider AS provider,
                COALESCE(u.last_seen, s.last_activity_at, s.started_at) AS at
           FROM session_model_usage u JOIN sessions s ON s.id = u.session_id
          ORDER BY COALESCE(u.last_seen, s.last_activity_at, s.started_at, 0) DESC`,
      )
      .all() as { session_id: string; model: string; provider: string; at: number }[];
    for (const r of usageRows) {
      const root = ancestorOf(lin, r.session_id);
      if (!want.has(root) || out.has(root)) continue;
      out.set(root, {
        model: r.model,
        provider: r.provider || "hermes",
        at: norm(r.at),
      });
    }
    const fallbackRows = db
      .prepare(
        `SELECT id, model, started_at, last_activity_at FROM sessions
          WHERE COALESCE(model, '') <> ''
          ORDER BY COALESCE(last_activity_at, started_at, 0) DESC`,
      )
      .all() as { id: string; model: string; started_at: number; last_activity_at: number | null }[];
    for (const r of fallbackRows) {
      const root = ancestorOf(lin, r.id);
      if (!want.has(root) || out.has(root)) continue;
      out.set(root, {
        model: r.model,
        provider: "hermes",
        at: norm(r.last_activity_at ?? r.started_at),
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

// Token per ancestor listable: SUM agregat kolom sessions seluruh lineage.
// Hanya ancestor dengan total > 0 (absen = tanpa pesan, klien sembunyikan).
export function getHermesTokenBySession(): TokenSession[] | null {
  const db = openDb();
  if (!db) return null;
  try {
    const lin = loadLineage(db);
    const rows = db
      .prepare(
        `SELECT id, COALESCE(input_tokens, 0) AS input_tokens, COALESCE(output_tokens, 0) AS output_tokens
           FROM sessions`,
      )
      .all() as { id: string; input_tokens: number; output_tokens: number }[];
    const byRoot = new Map<string, { total: number; input: number; output: number }>();
    for (const r of rows) {
      const total = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      if (total <= 0) continue;
      const root = ancestorOf(lin, r.id);
      if (!lin.listable.has(root)) continue;
      const cur = byRoot.get(root) ?? { total: 0, input: 0, output: 0 };
      cur.total += total;
      cur.input += r.input_tokens ?? 0;
      cur.output += r.output_tokens ?? 0;
      byRoot.set(root, cur);
    }
    const usageRows = db
      .prepare(
        `SELECT session_id, model, billing_provider AS provider,
                SUM(input_tokens) AS input, SUM(output_tokens) AS output,
                SUM(input_tokens + output_tokens) AS total
           FROM session_model_usage
          GROUP BY session_id, model, billing_provider`,
      )
      .all() as {
      session_id: string;
      model: string;
      provider: string;
      input: number | null;
      output: number | null;
      total: number | null;
    }[];
    const modelsByRoot = new Map<string, Map<string, SessionModelTokens>>();
    for (const r of usageRows) {
      const root = ancestorOf(lin, r.session_id);
      if (!lin.listable.has(root)) continue;
      const bucket = modelsByRoot.get(root) ?? new Map<string, SessionModelTokens>();
      const key = `${r.model}\u0000${r.provider}`;
      const cur = bucket.get(key) ?? {
        model: r.model,
        provider: r.provider || "hermes",
        total: 0,
        input: 0,
        output: 0,
      };
      cur.total += r.total ?? 0;
      cur.input += r.input ?? 0;
      cur.output += r.output ?? 0;
      bucket.set(key, cur);
      modelsByRoot.set(root, bucket);
    }
    return [...byRoot.entries()]
      .map(([session, t]) => ({
        session,
        ...t,
        models: [...(modelsByRoot.get(session)?.values() ?? [])].sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {}
  }
}
