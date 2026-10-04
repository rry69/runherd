import { useSyncExternalStore } from "react"
import { parseDateOnly, toDateOnly } from "@querycn/filter-core"

const subscribe = () => () => {}

/**
 * `false` on the server and while hydrating, then `true`. Output that depends
 * on the browser (locale, time zone) waits for it, so server and client HTML match.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}

/** A `YYYY-MM-DD` day in the user's locale, e.g. "Sep 25, 2026"; anything else as is. */
export function formatDateOnly(value: string): string {
  const date = parseDateOnly(value)
  return date
    ? date.toLocaleDateString(undefined, { dateStyle: "medium" })
    : value
}

const asIs = (value: string) => value

/** `formatDateOnly` once hydrated; the raw day before. */
export function useDateOnlyFormat(): (value: string) => string {
  return useHydrated() ? formatDateOnly : asIs
}

const ZONED = /T.*(?:Z|[+-]\d{2}:?\d{2})$/i
const pad = (part: number) => String(part).padStart(2, "0")

/** A zoned date-time (e.g. from `toISOString`) as the local `YYYY-MM-DDTHH:mm`; other values as is. */
export function toDateTimeLocal(value: string): string {
  const date = ZONED.test(value) ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return value
  return `${toDateOnly(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/

/** `"2026-09-28T14:05"` (or a zoned value, in local time) → its day and `HH:mm`. */
export function splitDateTime(value: string): { day?: string; time?: string } {
  const match = LOCAL_DATE_TIME.exec(toDateTimeLocal(value))
  return match ? { day: match[1], time: match[2] } : {}
}

/** A date-time as its day in the user's locale and a 24-hour time, e.g. "09/28/2026 14:05". */
export function formatDateTime(value: string): string {
  const { day, time } = splitDateTime(value)
  const date = day ? parseDateOnly(day) : null
  if (!date || !time) return value
  const text = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return `${text} ${time}`
}

const asDateTime = (value: string) => value.replace("T", " ")

/** `formatDateTime` once hydrated; the raw value, `T` spaced out, before. */
export function useDateTimeFormat(): (value: string) => string {
  return useHydrated() ? formatDateTime : asDateTime
}

/** The browser's local date and time as `YYYY-MM-DDTHH:mm`, for "Now". */
export function currentDateTime(): string {
  const now = new Date()
  return `${toDateOnly(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}
