export type SessionRow = {
  id: string;
  parent_id: string | null;
  directory: string;
  title: string;
  agent: string;
  time_updated: number;
};

export type SessionStatus = "thinking" | "idle";

export type SessionNodeData = {
  label: string;
  agent: string;
  title: string;
  status: SessionStatus;
  directory: string;
};

export type ActiveChild = {
  sessionId: string;
  parentId: string;
  agent: string;
  title: string;
  partType: string;
  tool: string | null;
  tokens: number;
  updatedAt: number;
  ageMs: number;
};

export type SessionLiveStatus = "thinking" | "queued" | "failed" | "idle" | "done";

export type SessionLiveWf = "thinking" | "done";

// Sesi top-level yang sedang streaming tanpa tool: root session id →
// time_created (ms) turn assistant yang belum punya `$.time.completed`.
// 0 / tidak ada = tidak ada turn terbuka. Field hilang = DB error, klien
// pertahankan status terakhir (fail-open, bukan auto-idle).
export type LiveMap = Record<string, number>;

// Riwayat task subagent dari part `tool=task`.
// durationMs null = masih running (state.time.end belum ada).
// Kontrak jujur 100% real dari DB (tabel part):
// - title: $.state.title ?? $.state.input.description (fallback description)
// - report: $.state.output (string besar, bisa null bila running/error-cancel)
// - errorText: $.state.error (string, null bila tidak error)
// - truncated: $.state.metadata.truncated == 1 (null/missing → false)
// - tools: daftar tool unik milik child session (dari getChildTools, fail-open [])
// - tokens: total token child session (dari getChildTokens, fail-open null)
export type SubagentTask = {
  childSessionId: string | null;
  parentSessionId: string | null;
  agent: string;
  description: string;
  status: "running" | "completed" | "error";
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  // Field kontrak jujur 100% real dari DB (produsen: getTaskHistory + route
  // enrichment; konsumen: Inspector). Wajib diisi produsen; mock statis wajib
  // ikut mengisi agar tsc hijau.
  title: string;
  report: string | null;
  errorText: string | null;
  truncated: boolean;
  tools: string[];
  tokens: number | null;
};

export type SessionLive = {
  row: SessionRow;
  status: SessionLiveStatus;
  wf: SessionLiveWf;
  ageMs: number;
  tool: string | null;
  partType: string;
  tokens: number;
  breakdown: [number, number, number];
};

export type ToolEvent = {
  sessionId: string;
  tool: string;
  status: "running" | "completed" | "error";
  at: number;
  filePath: string | null;
  origin: "main" | "sub";
  agent: string;
};

export type ChangedFile = {
  file: string;
  added: number;
  deleted: number;
  source: "filediff" | "write" | "patch-list";
};
