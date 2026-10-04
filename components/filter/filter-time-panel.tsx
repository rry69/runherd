import * as React from "react"

import { cn } from "cn"
import {
  HOURS,
  MINUTES,
  splitTime,
  withTimePart,
  type TimePart,
} from "@/components/filter/filter-time-parts"

interface TimeColumnProps {
  label: string
  items: string[]
  selected: string | undefined
  onPick: (item: string) => void
  onConfirm: () => void
  autoFocus?: boolean
}

/** One scrolling column of the picker, a listbox driven by ↑/↓, Home/End and Enter. */
function TimeColumn({
  label,
  items,
  selected,
  onPick,
  onConfirm,
  autoFocus,
}: TimeColumnProps) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const optionsId = React.useId()
  const optionId = (item: string) => `${optionsId}-${item}`
  const opening = React.useRef(selected)

  // Opens with the picked item at the top, like a wheel.
  React.useLayoutEffect(() => {
    const list = listRef.current
    const option =
      opening.current &&
      list?.querySelector<HTMLElement>(`[data-value="${opening.current}"]`)
    if (list && option) list.scrollTop = option.offsetTop - 4
  }, [])

  // An effect, not the attribute: it runs before a parent dialog focuses itself.
  React.useEffect(() => {
    if (autoFocus) listRef.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const pick = (item: string) => {
    onPick(item)
    listRef.current
      ?.querySelector<HTMLElement>(`[data-value="${item}"]`)
      // jsdom has no scrollIntoView.
      ?.scrollIntoView?.({ block: "nearest" })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = selected ? items.indexOf(selected) : -1
    const next =
      event.key === "ArrowDown"
        ? items[Math.min(index + 1, items.length - 1)]
        : event.key === "ArrowUp"
          ? items[Math.max(index - 1, 0)]
          : event.key === "Home"
            ? items[0]
            : event.key === "End"
              ? items.at(-1)
              : undefined
    if (next) pick(next)
    else if (event.key === "Enter" && selected) onConfirm()
    else return
    event.preventDefault()
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={selected ? optionId(selected) : undefined}
      onKeyDown={onKeyDown}
      className="relative h-full w-14 overflow-y-auto overscroll-contain p-1 outline-none [scrollbar-width:thin] focus-visible:bg-accent/40"
    >
      {items.map((item) => (
        <div
          key={item}
          id={optionId(item)}
          role="option"
          aria-selected={item === selected}
          data-value={item}
          onClick={() => pick(item)}
          className={cn(
            "flex h-7 cursor-default items-center justify-center rounded-sm text-sm tabular-nums select-none hover:bg-accent",
            item === selected &&
              "bg-primary/10 font-medium text-primary hover:bg-primary/15"
          )}
        >
          {item}
        </div>
      ))}
      {/* Room to scroll the last items up to the top. */}
      <div aria-hidden className="h-48" />
    </div>
  )
}

export interface TimeColumnsProps {
  value: string
  onChange: (time: string) => void
  /** Enter in a column, once a time is picked. */
  onConfirm: () => void
  labels: Record<TimePart, string>
  /** Focus the hour column on open, when nothing else in the picker should take it. */
  autoFocus?: boolean
  className?: string
}

/** Hour and minute columns side by side; picking one part starts the other at `00`. */
export function TimeColumns({
  value,
  onChange,
  onConfirm,
  labels,
  autoFocus,
  className,
}: TimeColumnsProps) {
  const parts = splitTime(value)
  const column = (part: TimePart, items: string[]) => (
    <TimeColumn
      label={labels[part]}
      items={items}
      selected={parts[part]}
      onPick={(item) => onChange(withTimePart(value, part, item))}
      onConfirm={onConfirm}
      autoFocus={autoFocus && part === "hour"}
    />
  )
  return (
    <div className={cn("flex h-56 divide-x", className)}>
      {column("hour", HOURS)}
      {column("minute", MINUTES)}
    </div>
  )
}
