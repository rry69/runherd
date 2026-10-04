"use client"

import * as React from "react"
import {
  findField,
  type FieldDefinition,
  type FilterRule,
  type RuleIssue,
} from "@querycn/filter-core"
import { useAppliedFilter } from "@querycn/filter-react"
import { XIcon } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FilterRuleWarnings } from "@/components/filter/filter-rule-warnings"
import { useRuleSummary } from "@/components/filter/filter-rule-summary"

const NO_ISSUES: readonly RuleIssue[] = []

/** The applied rules as chips; each one's × removes it right away. */
export function FilterChips({ className }: { className?: string }) {
  const { state, context, messages, ruleIssues, removeRule } =
    useAppliedFilter()
  const listRef = React.useRef<HTMLDivElement>(null)
  const focusAt = React.useRef<number | null>(null)

  // The removed chip had focus; hand it to the chip that took its place.
  React.useEffect(() => {
    if (focusAt.current === null) return
    const buttons = listRef.current?.querySelectorAll<HTMLElement>(
      "[data-slot=filter-chip-remove]"
    )
    buttons?.[Math.min(focusAt.current, buttons.length - 1)]?.focus()
    focusAt.current = null
  }, [state.rules])

  if (state.rules.length === 0) return null
  return (
    <div
      ref={listRef}
      data-slot="filter-chips"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {state.rules.map((rule, index) => {
        const field = findField(context, rule.field)
        if (!field) return null
        return (
          <React.Fragment key={rule.id}>
            {index > 0 && (
              <span className="text-xs text-muted-foreground">
                {messages.join[state.join]}
              </span>
            )}
            <FilterChip
              rule={rule}
              field={field}
              issues={ruleIssues[rule.id] ?? NO_ISSUES}
              onRemove={() => {
                focusAt.current = index
                removeRule(rule.id)
              }}
            />
          </React.Fragment>
        )
      })}
    </div>
  )
}

function FilterChip({
  rule,
  field,
  issues,
  onRemove,
}: {
  rule: FilterRule
  field: FieldDefinition
  issues: readonly RuleIssue[]
  onRemove: () => void
}) {
  const { messages } = useAppliedFilter()
  const summary = useRuleSummary(rule, field)
  const text = [summary.field, summary.operator, summary.value]
    .filter(Boolean)
    .join(" ")

  return (
    <span
      data-slot="filter-chip"
      className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full border border-primary/25 bg-primary/[0.06] pr-0.5 pl-3 text-xs"
    >
      <span
        title={text}
        className={cn(
          "truncate",
          // The backend ignores it, so it reads as crossed out.
          issues.includes("unsupported") && "text-muted-foreground line-through"
        )}
      >
        <span className="font-semibold text-primary">{summary.field}</span>{" "}
        <span className="text-muted-foreground">{summary.operator}</span>
        {summary.value !== undefined && ` ${summary.value}`}
      </span>
      <FilterRuleWarnings warnings={issues} />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        data-slot="filter-chip-remove"
        aria-label={`${messages.actions.removeRule}: ${text}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </span>
  )
}
