"use client";

import { Search, X, Loader, CircleDot, XCircle, Circle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KANBAN_CHIPS, type KanbanChip, type KanbanFilter } from "./types";

type ToolbarProps = {
  filter: KanbanFilter;
  agents: string[];
  showing: number;
  total: number;
  onQuery: (q: string) => void;
  onChip: (c: KanbanChip) => void;
  onTab: (t: string) => void;
  onClear: () => void;
};

const CHIP_ICONS: Record<KanbanChip, typeof Loader> = {
  thinking: Loader,
  queued: CircleDot,
  failed: XCircle,
  idle: Circle,
};

export default function Toolbar({
  filter,
  agents,
  showing,
  total,
  onQuery,
  onChip,
  onTab,
  onClear,
}: ToolbarProps) {
  const showClear = Boolean(filter.q || filter.chip || filter.tab !== "all");
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter.q}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search sessions..."
          className="h-8 w-40 pl-7 md:w-56"
        />
      </div>
      <ToggleGroup
        type="single"
        value={filter.chip ?? ""}
        onValueChange={(v) => {
          if (v) onChip(v as KanbanChip);
        }}
        size="sm"
      >
        {KANBAN_CHIPS.map((c) => {
          const Icon = CHIP_ICONS[c.key];
          return (
            <ToggleGroupItem key={c.key} value={c.key} aria-label={c.key}>
              <Icon className="h-3.5 w-3.5" />
              {c.key}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <Separator orientation="vertical" className="h-6" />
      <ToggleGroup
        type="single"
        value={filter.tab}
        onValueChange={(v) => {
          if (v) onTab(v);
        }}
        size="sm"
      >
        <ToggleGroupItem value="all" aria-label="all">
          All
        </ToggleGroupItem>
        {agents.map((a) => (
          <ToggleGroupItem key={a} value={a} aria-label={a}>
            {a}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Badge variant="secondary">
        {showing}/{total}
      </Badge>
      {showClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
