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

export type SessionLiveStatus = "thinking" | "queued" | "failed" | "progress" | "review" | "idle";

export type SessionLiveWf = "thinking" | "progress" | "review" | "done";

// Sesi top-level yang sedang streaming tanpa tool: root session id →
// time_created (ms) turn assistant yang belum punya `$.time.completed`.
// 0 / tidak ada = tidak ada turn terbuka. Field hilang = DB error, klien
// pertahankan status terakhir (fail-open, bukan auto-idle).
export type LiveMap = Record<string, number>;

// Riwayat task subagent dari part `tool=task`.
// durationMs null = masih running (state.time.end belum ada).
export type SubagentTask = {
  childSessionId: string | null;
  parentSessionId: string | null;
  agent: string;
  description: string;
  status: "running" | "completed" | "error";
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
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
