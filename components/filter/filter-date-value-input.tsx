import * as React from "react"
import { parseDateOnly, toDateOnly } from "@querycn/filter-core"
import { useFilterActions } from "@querycn/filter-react"
import { Direction } from "radix-ui"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { FilterValueSlotProps } from "@/components/filter/filter-rule-row"
import { useDateOnlyFormat } from "@/components/filter/filter-date-format"

const toDay = (value: string | undefined) =>
  (value && parseDateOnly(value)) || undefined

const toText = (date: Date | undefined) => (date && toDateOnly(date)) || ""

/** Days as `YYYY-MM-DD` in local time, so the picked day never shifts across time zones. */
export function DateValueInput({
  id,
  rule,
  field,
  arity,
  setValue,
}: FilterValueSlotProps) {
  const { messages } = useFilterActions()
  // The calendar's arrows and weeks follow the library's reading direction.
  const dir = Direction.useDirection()
  const [open, setOpen] = React.useState(false)
  const formatDateOnly = useDateOnlyFormat()
  const range = arity === "range"
  const [from, to] = (
    Array.isArray(rule.value) ? rule.value : [rule.value]
  ).map((value) =>
    typeof value === "string" && value !== "" ? value : undefined
  )
  const label = range
    ? from || to
      ? `${from ? formatDateOnly(from) : "…"} ${messages.rangeSeparator} ${to ? formatDateOnly(to) : "…"}`
      : undefined
    : from && formatDateOnly(from)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          size="sm"
          className={cn(
            "justify-start text-sm font-normal",
            range ? "w-56" : "w-40"
          )}
        >
          <CalendarIcon className="text-muted-foreground" />
          <span className="sr-only">{field.label}: </span>
          <span className={cn("truncate", !label && "text-muted-foreground")}>
            {label || messages.placeholders.date}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent dir={dir} className="w-auto p-0" align="start">
        {range ? (
          <Calendar
            dir={dir}
            mode="range"
            defaultMonth={toDay(from)}
            selected={{ from: toDay(from), to: toDay(to) }}
            onSelect={(next: DateRange | undefined) =>
              setValue([toText(next?.from), toText(next?.to)])
            }
          />
        ) : (
          <Calendar
            dir={dir}
            mode="single"
            // Clicking the picked day again keeps it instead of clearing the rule.
            required
            defaultMonth={toDay(from)}
            selected={toDay(from)}
            onSelect={(next: Date) => {
              setValue(toText(next))
              setOpen(false)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
