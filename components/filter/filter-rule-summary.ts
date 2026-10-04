import {
  getOperatorArity,
  getOperatorLabel,
  type FieldDefinition,
  type FilterRule,
} from "@querycn/filter-core"
import { useAppliedFilter, useFieldOptions } from "@querycn/filter-react"

import {
  useDateOnlyFormat,
  useDateTimeFormat,
} from "@/components/filter/filter-date-format"

export interface RuleSummary {
  field: string
  operator: string
  /** `undefined` for operators without a value, e.g. "is empty". */
  value: string | undefined
}

/** An applied rule in words, e.g. "Status", "is any of", "Active, Archived". */
export function useRuleSummary(
  rule: FilterRule,
  field: FieldDefinition
): RuleSummary {
  const { context, messages } = useAppliedFilter()
  const formatDateOnly = useDateOnlyFormat()
  const formatDateTime = useDateTimeFormat()
  const items = (
    rule.value === null
      ? []
      : Array.isArray(rule.value)
        ? rule.value
        : [rule.value]
  ).map((item) => (typeof item === "boolean" ? item : String(item)))
  const { getLabel } = useFieldOptions(field, {
    selected: items.filter((item) => typeof item === "string"),
    enabled: false,
  })

  const text = (item: string | boolean) =>
    typeof item === "boolean"
      ? messages.boolean[item ? "true" : "false"]
      : field.type === "date"
        ? formatDateOnly(item)
        : field.type === "datetime"
          ? formatDateTime(item)
          : getLabel(item)
  const arity =
    rule.operator === null
      ? undefined
      : getOperatorArity(rule.operator, context.registry.operators)

  return {
    field: field.label,
    operator:
      rule.operator === null
        ? ""
        : getOperatorLabel(messages, rule.operator, field.type),
    value:
      arity === "none" || items.length === 0
        ? undefined
        : items
            .map(text)
            .join(arity === "range" ? ` ${messages.rangeSeparator} ` : ", "),
  }
}
