"use client"

import * as React from "react"
import type {
  Arity,
  FieldDefinition,
  FilterRule,
  FilterValue,
} from "@querycn/filter-core"
import { useFilterActions, useFilterRule } from "@querycn/filter-react"
import { XIcon } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FilterFieldSelect } from "@/components/filter/filter-field-select"
import { FilterOperatorSelect } from "@/components/filter/filter-operator-select"
import { FilterDraftRuleWarnings } from "@/components/filter/filter-rule-warnings"
import { FilterValueInput } from "@/components/filter/filter-value-input"

export interface FilterValueSlotProps {
  /** Put on the first focusable element; it gets focus after an operator is picked. */
  id: string
  rule: FilterRule
  field: FieldDefinition
  arity: Exclude<Arity, "none">
  setValue: (value: FilterValue) => void
}

export interface FilterRuleRowProps {
  rule: FilterRule
  /**
   * Defaults to `FilterValueInput`. A component, not a render function, so the
   * memoized row keeps its props stable.
   */
  valueInput?: React.ComponentType<FilterValueSlotProps>
  className?: string
}

export const FilterRuleRow = React.memo(function FilterRuleRow({
  rule,
  valueInput: ValueInput = FilterValueInput,
  className,
}: FilterRuleRowProps) {
  const { messages } = useFilterActions()
  const {
    field,
    fields,
    operators,
    arity,
    setField,
    setOperator,
    setValue,
    remove,
  } = useFilterRule(rule)
  const valueId = React.useId()

  return (
    <div
      data-slot="filter-rule-row"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <FilterFieldSelect
        field={field}
        fields={fields}
        onFieldChange={setField}
      />
      <FilterOperatorSelect
        value={rule.operator}
        operators={operators}
        onValueChange={setOperator}
        focusAfterSelect={valueId}
        disabled={!field}
      />
      {field && arity && arity !== "none" && (
        // Keyed so a new field starts with fresh input state (search, loaded options).
        <ValueInput
          key={field.name}
          id={valueId}
          rule={rule}
          field={field}
          arity={arity}
          setValue={setValue}
        />
      )}
      {/* Right-aligned so remove buttons line up across rows. */}
      <div className="ml-auto flex items-center gap-1">
        <FilterDraftRuleWarnings rule={rule} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={messages.actions.removeRule}
          onClick={remove}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  )
})
