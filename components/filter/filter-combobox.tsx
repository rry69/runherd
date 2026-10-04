import * as React from "react"
import { Direction } from "radix-ui"
import type { SelectOption } from "@querycn/filter-core"
import { useFilterActions } from "@querycn/filter-react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface FilterComboboxProps {
  id?: string
  "aria-label": string
  /** Trigger content; `undefined` shows the placeholder. */
  label: React.ReactNode | undefined
  placeholder: string
  /** Already filtered for `search`. */
  options: readonly SelectOption[]
  selected: readonly string[]
  /** Picks toggle values and the list stays open. */
  multiple?: boolean
  onSelectedChange: (values: string[]) => void
  search: string
  onSearchChange: (search: string) => void
  emptyText: string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  onOpenChange?: (open: boolean) => void
  className?: string
}

/** A searchable select of one or several values; the caller does the filtering. */
export function FilterCombobox({
  id,
  "aria-label": ariaLabel,
  label,
  placeholder,
  options,
  selected,
  multiple = false,
  onSelectedChange,
  search,
  onSearchChange,
  emptyText,
  loading = false,
  error = false,
  onRetry,
  onOpenChange,
  className,
}: FilterComboboxProps) {
  const dir = Direction.useDirection()
  const { messages } = useFilterActions()
  const [open, setOpen] = React.useState(false)
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // Cleared on open, not close, so the list doesn't jump during the exit animation.
    if (next) onSearchChange("")
    onOpenChange?.(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn("w-40 justify-between text-sm font-normal", className)}
        >
          <span
            className={cn(
              "truncate",
              label === undefined && "text-muted-foreground"
            )}
          >
            {label ?? placeholder}
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent dir={dir} className="w-56 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={messages.placeholders.search}
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList aria-multiselectable={multiple || undefined}>
            {error ? (
              <div
                role="alert"
                className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground"
              >
                {messages.errors.loadOptions}
                <Button variant="outline" size="xs" onClick={onRetry}>
                  {messages.actions.retry}
                </Button>
              </div>
            ) : loading ? (
              // Also shown over the previous list while the next search loads.
              <div
                role="status"
                className="py-2 text-center text-xs text-muted-foreground"
              >
                {messages.loading}
              </div>
            ) : (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            <CommandGroup>
              {options.map((option) => {
                const checked = selected.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    // Shows the item's own check mark; several values get a checkbox instead.
                    data-checked={!multiple && checked}
                    // cmdk's aria-selected marks the highlighted item, not a picked one.
                    aria-checked={multiple ? checked : undefined}
                    onSelect={() => {
                      if (multiple) {
                        onSelectedChange(
                          checked
                            ? selected.filter((v) => v !== option.value)
                            : [...selected, option.value]
                        )
                      } else {
                        onSelectedChange([option.value])
                        handleOpenChange(false)
                      }
                    }}
                  >
                    {multiple && (
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input",
                          checked &&
                            "border-primary bg-primary text-primary-foreground"
                        )}
                      >
                        {checked && <CheckIcon className="size-3" />}
                      </span>
                    )}
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
