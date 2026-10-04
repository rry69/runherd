import { useFilterActions } from "@querycn/filter-react"
import { ClockIcon } from "lucide-react"

import {
  PickerField,
  PickerFooter,
  RangePickerField,
  type PickerPanel,
} from "@/components/filter/filter-picker-field"
import type { FilterValueSlotProps } from "@/components/filter/filter-rule-row"
import { TimeColumns } from "@/components/filter/filter-time-panel"
import { toTextRange } from "@/components/filter/filter-picker-field-parts"
import { currentTime } from "@/components/filter/filter-time-parts"

const asIs = (value: string) => value

/** A time of day as `HH:mm`, picked from hour and minute columns. */
export function TimeValueInput({
  id,
  rule,
  field,
  arity,
  setValue,
}: FilterValueSlotProps) {
  const { messages } = useFilterActions()
  const panel: PickerPanel = (value, onChange, onOk) => (
    <>
      <TimeColumns
        autoFocus
        value={value}
        onChange={onChange}
        onConfirm={onOk}
        labels={messages.placeholders}
      />
      <PickerFooter
        okDisabled={!value}
        onOk={onOk}
        onNow={() => {
          onChange(currentTime())
          onOk()
        }}
      />
    </>
  )
  return arity === "range" ? (
    <RangePickerField
      id={id}
      label={field.label}
      value={toTextRange(rule.value)}
      onChange={setValue}
      format={asIs}
      icon={ClockIcon}
      panel={panel}
      sideClassName="w-11"
    />
  ) : (
    <PickerField
      id={id}
      label={field.label}
      value={typeof rule.value === "string" ? rule.value : ""}
      onChange={setValue}
      format={asIs}
      placeholder={messages.placeholders.time}
      icon={ClockIcon}
      panel={panel}
      className="w-32"
    />
  )
}
