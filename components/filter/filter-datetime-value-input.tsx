"use client"

import { parseDateOnly, toDateOnly } from "@querycn/filter-core"
import { useFilterActions } from "@querycn/filter-react"
import { Direction } from "radix-ui"
import { CalendarIcon } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import {
  PickerField,
  PickerFooter,
  RangePickerField,
  type PickerPanel,
} from "@/components/filter/filter-picker-field"
import type { FilterValueSlotProps } from "@/components/filter/filter-rule-row"
import {
  currentDateTime,
  splitDateTime,
  useDateTimeFormat,
} from "@/components/filter/filter-date-format"
import { TimeColumns } from "@/components/filter/filter-time-panel"
import { toTextRange } from "@/components/filter/filter-picker-field-parts"

const toDay = (day: string | undefined) =>
  (day && parseDateOnly(day)) || undefined

/**
 * A moment as the local `YYYY-MM-DDTHH:mm`, picked from a calendar and hour
 * and minute columns. A zoned value (e.g. "…Z") shows in local time.
 */
export function DateTimeValueInput({
  id,
  rule,
  field,
  arity,
  setValue,
}: FilterValueSlotProps) {
  const { messages } = useFilterActions()
  // The calendar's arrows and weeks follow the library's reading direction.
  const dir = Direction.useDirection()
  const format = useDateTimeFormat()
  const panel: PickerPanel = (value, onChange, onOk) => {
    const { day, time } = splitDateTime(value)
    return (
      <>
        <div className="flex">
          <Calendar
            dir={dir}
            mode="single"
            // Clicking the picked day again keeps it instead of clearing it.
            required
            defaultMonth={toDay(day)}
            selected={toDay(day)}
            onSelect={(date: Date) =>
              onChange(`${toDateOnly(date)}T${time ?? "00:00"}`)
            }
          />
          {/* As tall as the calendar, whatever the month. */}
          <div className="relative w-28 border-s">
            <TimeColumns
              className="absolute inset-0 h-auto"
              value={time ?? ""}
              onChange={(next) =>
                onChange(`${day ?? currentDateTime().slice(0, 10)}T${next}`)
              }
              onConfirm={onOk}
              labels={messages.placeholders}
            />
          </div>
        </div>
        <PickerFooter
          okDisabled={!day}
          onOk={onOk}
          onNow={() => {
            onChange(currentDateTime())
            onOk()
          }}
        />
      </>
    )
  }
  return arity === "range" ? (
    <RangePickerField
      id={id}
      label={field.label}
      value={toTextRange(rule.value)}
      onChange={setValue}
      format={format}
      icon={CalendarIcon}
      panel={panel}
      sideClassName="min-w-11"
    />
  ) : (
    <PickerField
      id={id}
      label={field.label}
      value={typeof rule.value === "string" ? rule.value : ""}
      onChange={setValue}
      format={format}
      placeholder={messages.placeholders.datetime}
      icon={CalendarIcon}
      panel={panel}
      className="w-48"
    />
  )
}
