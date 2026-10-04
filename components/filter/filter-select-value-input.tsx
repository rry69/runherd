"use client"

import * as React from "react"
import type { FilterValue } from "@querycn/filter-core"
import { useFieldOptions, useFilterActions } from "@querycn/filter-react"

import { Badge } from "@/components/ui/badge"
import { FilterCombobox } from "@/components/filter/filter-combobox"
import type { FilterValueSlotProps } from "@/components/filter/filter-rule-row"

const toValues = (value: FilterValue): string[] =>
  value === null
    ? []
    : Array.isArray(value)
      ? value.map(String)
      : [String(value)]

/**
 * One value, or several for `multi` operators (`in`, `notIn`), from static
 * `options` or `loadOptions`. The row keys it by field, so a new field starts fresh.
 */
export function SelectValueInput({
  id,
  rule,
  field,
  arity,
  setValue,
}: FilterValueSlotProps) {
  const { messages } = useFilterActions()
  const [open, setOpen] = React.useState(false)
  const multiple = arity === "multi"
  const selected = React.useMemo(() => toValues(rule.value), [rule.value])
  const { options, loading, error, query, search, retry, getLabel } =
    useFieldOptions(field, { selected, enabled: open })
  const [first] = selected

  return (
    <FilterCombobox
      id={id}
      aria-label={field.label}
      label={
        first === undefined ? undefined : selected.length > 1 ? (
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">{getLabel(first)}</span>
            <Badge variant="secondary" className="shrink-0">
              {messages.counts.more(selected.length - 1)}
            </Badge>
          </span>
        ) : (
          getLabel(first)
        )
      }
      placeholder={messages.placeholders.value}
      options={options}
      selected={selected}
      multiple={multiple}
      onSelectedChange={(values) =>
        setValue(multiple ? values : (values[0] ?? null))
      }
      search={query}
      onSearchChange={search}
      emptyText={messages.empty.options}
      loading={loading}
      error={error !== null}
      onRetry={retry}
      onOpenChange={setOpen}
    />
  )
}
