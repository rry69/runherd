import { useFilterActions } from "@querycn/filter-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FilterValueSlotProps } from "@/components/filter/filter-rule-row"

export function BooleanValueInput({
  id,
  rule,
  field,
  setValue,
}: FilterValueSlotProps) {
  const { messages } = useFilterActions()
  return (
    <Select
      value={typeof rule.value === "boolean" ? String(rule.value) : ""}
      onValueChange={(next) => {
        // Inside a form Radix mirrors the value into a hidden <select>, which can report "".
        if (next === "true" || next === "false") setValue(next === "true")
      }}
    >
      <SelectTrigger
        id={id}
        size="sm"
        aria-label={field.label}
        className="w-28"
      >
        <SelectValue placeholder={messages.placeholders.value} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value="true">{messages.boolean.true}</SelectItem>
        <SelectItem value="false">{messages.boolean.false}</SelectItem>
      </SelectContent>
    </Select>
  )
}
