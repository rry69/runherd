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
