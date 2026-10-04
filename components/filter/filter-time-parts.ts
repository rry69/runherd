import type { FilterValue } from "@querycn/filter-core"

import { currentDateTime } from "@/components/filter/filter-date-format"

const pad = (part: number) => String(part).padStart(2, "0")

export const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour))
export const MINUTES = Array.from({ length: 60 }, (_, minute) => pad(minute))

export type TimePart = "hour" | "minute"

const TIME = /^(\d{2}):(\d{2})$/

/** `"09:30"` → `{ hour: "09", minute: "30" }`; anything else has neither part. */
export function splitTime(value: FilterValue | undefined): {
  hour?: string
  minute?: string
} {
  const match = typeof value === "string" ? TIME.exec(value) : null
  return match ? { hour: match[1], minute: match[2] } : {}
}

/** The time with one part picked; the other part starts at `00`, so every pick is a valid time. */
export function withTimePart(
  value: FilterValue | undefined,
  part: TimePart,
  next: string
): string {
  const { hour = "00", minute = "00" } = splitTime(value)
  return part === "hour" ? `${next}:${minute}` : `${hour}:${next}`
}

/** The browser's local time, for "Now". */
export const currentTime = () => currentDateTime().slice(11)
