"use client";

import { formatTokensCompact, type KanbanItem } from "./types";

type SessionRowProps = {
  item: KanbanItem;
  selected: boolean;
  checked: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

function statusBadge(item: KanbanItem): { cls: string; label: string } {
  if (item.status === "thinking") return { cls: "running", label: "● running" };
  if (item.status === "queued") return { cls: "queued", label: "◷ queued" };
  if (item.status === "failed") return { cls: "failed", label: "✕ failed" };
  return { cls: "idle", label: "○ idle" };
}

export default function SessionRow({
  item,
  selected,
  checked,
  onSelect,
  onToggleCheck,
  onRename,
  onDelete,
}: SessionRowProps) {
  const badge = statusBadge(item);
  const isRunning = item.status === "thinking";
  const rowModels = item.modelTokens.length
    ? item.modelTokens
    : item.model
      ? [{ ...item.model, total: 0, input: 0, output: 0 }]
      : [];
  const visibleModels = rowModels.slice(0, 3);
  const hiddenModelCount = Math.max(0, rowModels.length - visibleModels.length);
  const dotCls = item.status === "failed" ? "failed" : isRunning ? "running" : "idle";
  const runningClass = isRunning ? " is-running" : "";
  const kind = item.agent.trim().toLowerCase() === "plan" ? "plan" : "build";

  let fileAdded = 0;
  let fileDeleted = 0;
  for (const f of item.changedFiles ?? []) {
    if (f.source === "patch-list") continue;
    fileAdded += f.added;
    fileDeleted += f.deleted;
  }
  const hasFiles = (item.changedFiles ?? []).length > 0;
  const tokenLabel = item.totalTokensLabel ?? item.tokensLabel;
  const showInOut = item.totalTokensIn != null || item.totalTokensOut != null;
  const metaSecond =
    item.title && item.title.trim() && item.title.trim() !== item.alias
      ? item.title.trim()
      : "New session";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
      className={`lin-session-row${runningClass}${selected ? " selected" : ""}`}
      data-id={item.id}
    >
      <div className={`lin-dot ${dotCls}`} aria-hidden="true" />
      <button
        type="button"
        aria-label={checked ? "Uncheck session" : "Check session"}
        aria-pressed={checked}
        className={`lin-checkbox${checked ? " checked" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(item.id);
        }}
      >
        {checked ? "✓" : ""}
      </button>
      <span className={`lin-source-badge ${kind}`}>
        <span className="lin-source-icon">⌁</span> {kind}
      </span>
      <div className="lin-session-content">
        <div className="lin-session-title-row">
          <span className="lin-session-title" title={item.alias}>
            {item.alias}
          </span>
          <span className="lin-session-id">{item.id.slice(0, 8)}</span>
        </div>
        <div className="lin-session-meta">
          <span className="lin-session-path" title={item.dir}>
            {item.dir}
          </span>
          <span>·</span>
          <span className="truncate" title={metaSecond}>
            {metaSecond} · {item.ageLabel} ago
          </span>
        </div>
      </div>
      <div className="lin-session-stats">
        <span className="lin-token-badge">◈ {tokenLabel}</span>
        {showInOut && (
          <span className="lin-token-detail">
            in {formatTokensCompact(item.totalTokensIn ?? 0)} · out{" "}
            {formatTokensCompact(item.totalTokensOut ?? 0)}
          </span>
        )}
        {hasFiles && (
          <span className="lin-files-changed">
            <span className="add">+{fileAdded}</span> <span className="del">-{fileDeleted}</span>
          </span>
        )}
        <div className="lin-breakbar" aria-hidden="true">
          <span style={{ width: `${item.breakdown[0]}%` }} />
          <span style={{ width: `${item.breakdown[1]}%` }} />
          <span style={{ width: `${item.breakdown[2]}%` }} />
        </div>
      </div>
      <div
        className="lin-row-actions"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="lin-row-btn"
          onClick={() => onRename(item.id)}
          title="Rename/edit"
        >
          Edit
        </button>
        <button
          type="button"
          className="lin-row-btn danger"
          onClick={() => onDelete(item.id)}
          title="Hapus"
        >
          Delete
        </button>
      </div>
        {isRunning && visibleModels.map((model) => (
          <span
            className="lin-model-badge"
            key={`${model.model}:${model.provider}`}
            title={model.total > 0
              ? `${model.model} · ${model.provider}: ${model.total.toLocaleString("id-ID")} tokens (in ${model.input.toLocaleString("id-ID")} · out ${model.output.toLocaleString("id-ID")})`
              : `${model.model} · ${model.provider}`}
          >
            {model.model}
          </span>
        ))}
        {isRunning && hiddenModelCount > 0 && (
          <span className="lin-model-badge" title={rowModels.slice(3).map((model) => model.model).join(", ")}>+{hiddenModelCount}</span>
        )}
       <span className={`lin-status-badge ${badge.cls}`}>{badge.label}</span>
       <span className="lin-time">{item.ageLabel}</span>
    </div>
  );
}
