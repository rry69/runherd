"use client";

import { Search, X, Loader, CircleDot, XCircle, Circle, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { KANBAN_CHIPS, type KanbanChip, type KanbanFilter } from "./types";

type ToolbarProps = {
  filter: KanbanFilter;
  agents: string[];
  showing: number;
  total: number;
  stuckCount: number;
  onQuery: (q: string) => void;
  onChip: (c: KanbanChip) => void;
  onTab: (t: string) => void;
  onClear: () => void;
  onResetStuck: () => void;
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
  stuckCount,
  onQuery,
  onChip,
  onTab,
  onClear,
  onResetStuck,
}: ToolbarProps) {
  const showClear = Boolean(filter.q || filter.chip || filter.tab !== "all");
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter.q}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search sessions..."
          className="h-8 w-40 pl-7 md:w-56 md:text-[15px]"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Status: {filter.chip ?? "All"}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Filter status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              if (filter.chip) onChip(filter.chip);
            }}
          >
            All
          </DropdownMenuItem>
          {KANBAN_CHIPS.map((c) => {
            const Icon = CHIP_ICONS[c.key];
            return (
              <DropdownMenuItem key={c.key} onSelect={() => onChip(c.key)}>
                <Icon className="h-4 w-4" />
                {c.key}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" className="h-6" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Agent: {filter.tab}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Filter agent</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onTab("all")}>All</DropdownMenuItem>
          {agents.map((a) => (
            <DropdownMenuItem key={a} onSelect={() => onTab(a)}>
              {a}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Badge variant="secondary" className="tabular-nums">
        {showing}/{total}
      </Badge>
      {showClear && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-[13px]">
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
      {stuckCount > 0 && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (window.confirm(`Sembunyikan ${stuckCount} sesi stuck (failed)?`)) onResetStuck();
          }}
          title="Sembunyikan semua sesi stuck (status failed)"
          className="text-[13px]"
        >
          <XCircle className="h-3.5 w-3.5" />
          Reset stuck ({stuckCount})
        </Button>
      )}
    </div>
  );
}
