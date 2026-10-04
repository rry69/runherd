"use client"

import type { Join } from "@querycn/filter-core"
import { useFilterActions } from "@querycn/filter-react"

import { cn } from "cn"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface FilterJoinSelectProps {
  value: Join
  onValueChange: (join: Join) => void
  className?: string
}

export function FilterJoinSelect({
  value,
  onValueChange,
  className,
}: FilterJoinSelectProps) {
  const { messages } = useFilterActions()
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        // Inside a form Radix mirrors the value into a hidden <select>, which can report "".
        if (next === "and" || next === "or") onValueChange(next)
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={messages.join.toggle}
        className={cn("w-full", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value="and">{messages.join.and}</SelectItem>
        <SelectItem value="or">{messages.join.or}</SelectItem>
      </SelectContent>
    </Select>
  )
}
