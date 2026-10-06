"use client";

import { useEffect, useRef, useState } from "react";
import type { KanbanChip, KanbanFilter } from "./types";

export type LinearTabKey = "all" | "unread" | "idle" | "build" | "plan";

type LinearChromeProps = {
  filter: KanbanFilter;
  agents: string[];
  counts: Record<LinearTabKey, number>;
  activeTab: LinearTabKey;
  breadcrumb: string;
  onTab: (t: LinearTabKey) => void;
  onQuery: (q: string) => void;
  onChip: (c: KanbanChip) => void;
  onAgentTab: (t: string) => void;
  onClear: () => void;
  showSearch: boolean;
  onToggleSearch: () => void;
};

const STATUS_OPTS: { key: KanbanChip | null; label: string }[] = [
  { key: null, label: "All statuses" },
  { key: "thinking", label: "● thinking" },
  { key: "queued", label: "◷ queued" },
  { key: "failed", label: "✕ failed" },
  { key: "idle", label: "○ idle" },
];

export function LinearTopbar({
  filter,
  agents,
  breadcrumb,
  onQuery,
  onChip,
  onAgentTab,
  onClear,
  showSearch,
  onToggleSearch,
}: Omit<LinearChromeProps, "counts" | "activeTab" | "onTab">) {
  const [filterOpen, setFilterOpen] = useState(false);
  const ddRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => {
      if (!ddRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [filterOpen]);

  const filterActive = Boolean(filter.chip) || (filter.tab !== "all" && filter.tab !== "build" && filter.tab !== "plan");

  return (
    <header className="lin-topbar">
      <div className="lin-breadcrumb">
        <span>Sessions</span>
        <span className="lin-breadcrumb-sep">/</span>
        <strong>{breadcrumb}</strong>
      </div>
      <div className="lin-topbar-actions">
        {showSearch && (
          <input
            autoFocus
            value={filter.q}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search sessions..."
            className="lin-search-input"
            aria-label="Search sessions"
          />
        )}
        <button type="button" className="lin-btn" onClick={onToggleSearch} title="Search">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M11 11l3 3" />
          </svg>
          Search
        </button>
        <span ref={ddRef} className={`lin-dropdown${filterOpen ? " open" : ""}`}>
          <button
            type="button"
            className="lin-btn"
            onClick={() => setFilterOpen((v) => !v)}
            title="Filter"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M4 8h8M6 12h4" />
            </svg>
            Filter{filterActive ? " •" : ""}
          </button>
          <span className="lin-menu">
            {STATUS_OPTS.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  if (s.key === null) {
                    if (filter.chip) onChip(filter.chip);
                  } else if (s.key !== filter.chip) {
                    onChip(s.key);
                  }
                  setFilterOpen(false);
                }}
              >
                {s.key === filter.chip || (s.key === null && !filter.chip) ? "✓ " : "　"}
                {s.label}
              </button>
            ))}
            <span
              style={{
                display: "block",
                borderTop: "1px solid var(--border)",
                margin: "4px 0",
              }}
            />
            <button
              onClick={() => {
                onAgentTab("all");
                setFilterOpen(false);
              }}
            >
              {filter.tab === "all" ? "✓ " : "　"}Agent: All
            </button>
            {agents.map((a) => (
              <button
                key={a}
                onClick={() => {
                  onAgentTab(a);
                  setFilterOpen(false);
                }}
              >
                {filter.tab === a ? "✓ " : "　"}Agent: {a}
              </button>
            ))}
            <button
              onClick={() => {
                onClear();
                setFilterOpen(false);
              }}
            >
              　Clear all
            </button>
          </span>
        </span>
        <button
          type="button"
          className="lin-btn lin-btn-primary"
          title="Observer read-only — new session dibuat dari opencode/Hermes, bukan dashboard"
          onClick={() => window.alert("Dashboard read-only: sesi baru dibuat dari opencode/Hermes.")}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3v10M3 8h10" />
          </svg>
          New session
        </button>
      </div>
    </header>
  );
}

export function LinearTabs({
  counts,
  activeTab,
  onTab,
}: Pick<LinearChromeProps, "counts" | "activeTab" | "onTab">) {
  const tabs: { key: LinearTabKey; label: string; count?: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "unread", label: "Unread", count: counts.unread },
    { key: "idle", label: "Idle" },
    { key: "build", label: "Build" },
    { key: "plan", label: "Plan" },
  ];
  return (
    <div className="lin-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={activeTab === t.key}
          className={`lin-tab${activeTab === t.key ? " active" : ""}`}
          onClick={() => onTab(t.key)}
        >
          {t.label}
          {t.count != null && <span className="lin-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
