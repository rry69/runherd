import { Direction } from "radix-ui"
import type { FilterRule } from "@querycn/filter-core"
import {
  useAppliedFilter,
  useRuleWarnings,
  type RuleWarningKey,
} from "@querycn/filter-react"
import { TriangleAlertIcon } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** A warning icon that shows what may go wrong when pressed, so it works on touch too. Nothing when there are none. */
export function FilterRuleWarnings({
  warnings,
  className,
}: {
  warnings: readonly RuleWarningKey[]
  className?: string
}) {
  const dir = Direction.useDirection()
  const { messages } = useAppliedFilter()
  if (warnings.length === 0) return null
  const texts = warnings.map((key) => messages.warnings[key])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={texts.join(". ")}
          className={cn(
            "text-amber-600 hover:text-amber-600 aria-expanded:text-amber-600 dark:text-amber-500 dark:hover:text-amber-500 dark:aria-expanded:text-amber-500",
            className
          )}
        >
          <TriangleAlertIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir={dir}
        side="top"
        className="w-auto max-w-xs gap-1 p-2 text-xs"
      >
        {texts.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Warnings for a draft rule. It re-renders with the draft, so the memoized row around it doesn't. */
export function FilterDraftRuleWarnings({ rule }: { rule: FilterRule }) {
  return <FilterRuleWarnings warnings={useRuleWarnings(rule)} />
}
