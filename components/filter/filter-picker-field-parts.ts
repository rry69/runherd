import type { FilterValue } from "@querycn/filter-core"

/** A range's two values as text, or two blanks. */
export function toTextRange(value: FilterValue): [string, string] {
  return Array.isArray(value) && value.length === 2
    ? [String(value[0] ?? ""), String(value[1] ?? "")]
    : ["", ""]
}

/** A range field: looks like one input holding both ends. */
export const pickerRangeFieldClassName =
  "flex h-7 w-fit items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors focus-within:border-ring dark:bg-input/30"

/** One end of a range field, underlined while its picker is open. */
export const pickerRangeSideClassName =
  "relative flex h-full shrink-0 items-center text-start tabular-nums outline-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity focus-visible:after:opacity-100 data-active:after:opacity-100 data-invalid:text-destructive"
