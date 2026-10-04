"use client"

import * as React from "react"
import { Direction } from "radix-ui"
import { useFilterActions } from "@querycn/filter-react"
import { ArrowRightIcon, type LucideIcon } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  pickerRangeFieldClassName,
  pickerRangeSideClassName,
} from "@/components/filter/filter-picker-field-parts"

/** What a picker's popover shows; `onOk` closes it (or moves on to a range's end). */
export type PickerPanel = (
  value: string,
  onChange: (value: string) => void,
  onOk: () => void
) => React.ReactNode

interface PickerFieldBaseProps {
  id?: string
  label: string
  format: (value: string) => string
  icon: LucideIcon
  panel: PickerPanel
}

/** Now and OK under a picker. */
export function PickerFooter({
  onNow,
  onOk,
  okDisabled,
}: {
  onNow: () => void
  onOk: () => void
  okDisabled: boolean
}) {
  const { messages } = useFilterActions()
  return (
    <div className="flex items-center justify-between gap-2 border-t p-1.5">
      <Button variant="link" size="sm" className="h-7 px-1.5" onClick={onNow}>
        {messages.actions.now}
      </Button>
      <Button size="sm" className="h-7" disabled={okDisabled} onClick={onOk}>
        {messages.actions.ok}
      </Button>
    </div>
  )
}

/** A button showing the value, opening `panel` in a popover. */
export function PickerField({
  id,
  label,
  value,
  onChange,
  format,
  placeholder,
  icon: Icon,
  panel,
  className,
}: PickerFieldBaseProps & {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  const dir = Direction.useDirection()
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          size="sm"
          className={cn(
            "justify-between text-sm font-normal tabular-nums",
            className
          )}
        >
          <span className="sr-only">{label}: </span>
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? format(value) : placeholder}
          </span>
          <Icon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent dir={dir} className="w-auto gap-0 p-0" align="start">
        {panel(value, onChange, () => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

type Side = "from" | "to"

/** Both ends of a range in one field; OK on the start moves on to the end. */
export function RangePickerField({
  id,
  label,
  value: [from, to],
  onChange,
  format,
  icon: Icon,
  panel,
  sideClassName,
}: PickerFieldBaseProps & {
  value: [string, string]
  onChange: (value: [string, string]) => void
  sideClassName?: string
}) {
  const dir = Direction.useDirection()
  const { messages } = useFilterActions()
  const [open, setOpen] = React.useState<Side | null>(null)

  const side = (name: Side, value: string, other: string) => (
    <Popover
      open={open === name}
      onOpenChange={(next) =>
        setOpen((current) => (next ? name : current === name ? null : current))
      }
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={name === "from" ? id : undefined}
          aria-label={`${label} ${messages.placeholders[name]}`}
          data-active={open === name || undefined}
          // A range with one end picked is dropped on apply, so flag the empty end.
          data-invalid={(value === "" && other !== "") || undefined}
          className={cn(pickerRangeSideClassName, sideClassName)}
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value ? format(value) : messages.placeholders[name]}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        dir={dir}
        className="w-auto gap-0 p-0"
        align="start"
        // Moving on to the end: focus goes to its picker, not back here.
        onCloseAutoFocus={(event) => {
          if (name === "from" && open === "to") event.preventDefault()
        }}
      >
        {panel(
          value,
          (next) => onChange(name === "from" ? [next, to] : [from, next]),
          () => setOpen(name === "from" ? "to" : null)
        )}
      </PopoverContent>
    </Popover>
  )

  return (
    <div className={pickerRangeFieldClassName}>
      {side("from", from, to)}
      <ArrowRightIcon
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground rtl:rotate-180"
      />
      {side("to", to, from)}
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}
