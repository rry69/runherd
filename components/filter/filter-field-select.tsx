"use client"

import * as React from "react"
import { filterOptions, type FieldDefinition } from "@querycn/filter-core"
import { useFilterActions } from "@querycn/filter-react"

import { FilterCombobox } from "@/components/filter/filter-combobox"

export interface FilterFieldSelectProps {
  /** The rule's field; shown even when it isn't in `fields`. */
  field: FieldDefinition | undefined
  fields: readonly FieldDefinition[]
  onFieldChange: (name: string) => void
  className?: string
}

export function FilterFieldSelect({
  field,
  fields,
  onFieldChange,
  className,
}: FilterFieldSelectProps) {
  const { messages } = useFilterActions()
  const [search, setSearch] = React.useState("")
  const options = React.useMemo(
    () => fields.map((f) => ({ label: f.label, value: f.name })),
    [fields]
  )

  return (
    <FilterCombobox
      aria-label={messages.placeholders.field}
      label={field?.label}
      placeholder={messages.placeholders.field}
      // Matches ignoring accents, like the rest of the filter.
      options={filterOptions(options, search)}
      selected={field ? [field.name] : []}
      onSelectedChange={([name]) => {
        if (name !== undefined) onFieldChange(name)
      }}
      search={search}
      onSearchChange={setSearch}
      emptyText={messages.empty.fields}
      className={className}
    />
  )
}
