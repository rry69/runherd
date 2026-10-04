"use client"

import * as React from "react"
import { getFieldType, type FilterValue } from "@querycn/filter-core"
import { useFilterActions } from "@querycn/filter-react"

import { cn } from "cn"
import { Input } from "@/components/ui/input"
import type { FilterValueSlotProps } from "@/components/filter/filter-rule-row"

const toText = (value: FilterValue | undefined): string =>
  value === null || value === undefined || typeof value === "object"
    ? ""
    : String(value)

function TextLikeInput({
  id,
  rule,
  field,
  arity,
  setValue,
}: FilterValueSlotProps) {
  const { context, messages } = useFilterActions()
  // Raw text goes into the draft; the field type parses it on apply, so "1." can be typed.
  const invalid = (text: string) =>
    text.trim() !== "" &&
    getFieldType(field, context.registry)?.parseValue(text, "single") ===
      undefined
  const input = (
    text: string,
    onText: (text: string) => void,
    props: React.ComponentProps<"input">
  ) => (
    <Input
      value={text}
      onChange={(event) => onText(event.target.value)}
      aria-invalid={invalid(text) || undefined}
      {...props}
      className={cn("h-7", props.className)}
    />
  )

  if (arity === "range") {
    const [from, to] =
      Array.isArray(rule.value) && rule.value.length === 2
        ? rule.value.map(toText)
        : ["", ""]
    // A range with one side filled is dropped on apply, so flag the empty side.
    const missing = (text: string, other: string) =>
      text.trim() === "" && other.trim() !== ""
    return (
      <div className="flex items-center gap-1.5">
        {input(from!, (text) => setValue([text, to!]), {
          id,
          className: "w-24",
          placeholder: messages.placeholders.from,
          "aria-invalid": invalid(from!) || missing(from!, to!) || undefined,
          "aria-label": `${field.label} ${messages.placeholders.from}`,
        })}
        <span aria-hidden className="text-sm text-muted-foreground">
          {messages.rangeSeparator}
        </span>
        {input(to!, (text) => setValue([from!, text]), {
          className: "w-24",
          placeholder: messages.placeholders.to,
          "aria-invalid": invalid(to!) || missing(to!, from!) || undefined,
          "aria-label": `${field.label} ${messages.placeholders.to}`,
        })}
      </div>
    )
  }

  if (arity !== "single") return null
  return input(toText(rule.value), setValue, {
    id,
    className: "w-40",
    placeholder: messages.placeholders.value,
    "aria-label": field.label,
  })
}

export function TextValueInput(props: FilterValueSlotProps) {
  return <TextLikeInput {...props} />
}

// No `inputMode="decimal"`: iOS's decimal keypad has no minus key.
export function NumberValueInput(props: FilterValueSlotProps) {
  return <TextLikeInput {...props} />
}
