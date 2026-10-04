import type * as React from "react"
import type { FieldTypeId } from "@querycn/filter-core"

import { BooleanValueInput } from "@/components/filter/filter-boolean-value-input"
import { DateValueInput } from "@/components/filter/filter-date-value-input"
import { DateTimeValueInput } from "@/components/filter/filter-datetime-value-input"
import type { FilterValueSlotProps } from "@/components/filter/filter-rule-row"
import { SelectValueInput } from "@/components/filter/filter-select-value-input"
import { TimeValueInput } from "@/components/filter/filter-time-value-input"
import {
  NumberValueInput,
  TextValueInput,
} from "@/components/filter/filter-text-value-input"

export type FilterValueInputs = Partial<
  Record<FieldTypeId, React.ComponentType<FilterValueSlotProps>>
>

/** Value input per field type; a custom field type adds its own entry. */
export const filterValueInputs: FilterValueInputs = {
  text: TextValueInput,
  number: NumberValueInput,
  boolean: BooleanValueInput,
  select: SelectValueInput,
  multiSelect: SelectValueInput,
  date: DateValueInput,
  datetime: DateTimeValueInput,
  time: TimeValueInput,
}

export interface FilterValueInputProps extends FilterValueSlotProps {
  /** Overrides by field type, e.g. `{ ...filterValueInputs, rating: RatingInput }`. */
  inputs?: FilterValueInputs
}

/**
 * Picks the input for the rule's field type; types without one get a text
 * input, which handles single and range values only.
 */
export function FilterValueInput({
  inputs = filterValueInputs,
  ...props
}: FilterValueInputProps) {
  const { type } = props.field
  // Own keys only: a custom type id like "toString" must not hit Object.prototype.
  const Input = Object.hasOwn(inputs, type) ? inputs[type] : undefined
  return Input ? <Input {...props} /> : <TextValueInput {...props} />
}
