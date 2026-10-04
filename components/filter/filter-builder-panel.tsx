import * as React from "react"
import { useFilter } from "@querycn/filter-react"
import { PlusIcon } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FilterJoinSelect } from "@/components/filter/filter-join-select"
import {
  FilterRuleRow,
  type FilterRuleRowProps,
} from "@/components/filter/filter-rule-row"

function lostFocus() {
  const active = document.activeElement
  return (
    !active ||
    active === document.body ||
    !active.isConnected ||
    (active as HTMLButtonElement).disabled === true
  )
}

export interface FilterBuilderPanelProps {
  valueInput?: FilterRuleRowProps["valueInput"]
  /** Offers AND/OR on the second rule. Defaults to `true`; otherwise rules keep the current join. */
  allowJoinToggle?: boolean
  /** Runs after Apply, e.g. to close a popover. */
  onApply?: () => void
  className?: string
}

/** The draft rules with Add, Clear all and Apply. Enter in a text field applies. */
export function FilterBuilderPanel({
  valueInput,
  allowJoinToggle = true,
  onApply,
  className,
}: FilterBuilderPanelProps) {
  const {
    state,
    isDirty,
    canAddRule,
    messages,
    addRule,
    setJoin,
    apply,
    reset,
  } = useFilter()
  const listRef = React.useRef<HTMLDivElement>(null)
  const addRef = React.useRef<HTMLButtonElement>(null)
  const added = React.useRef(false)
  const ids = state.rules.map((rule) => rule.id).join()
  const previousIds = React.useRef(ids)

  React.useEffect(() => {
    if (ids === previousIds.current) return
    previousIds.current = ids
    if (added.current) {
      added.current = false
      const rows = listRef.current?.querySelectorAll(
        "[data-slot=filter-rule-row]"
      )
      rows?.[rows.length - 1]?.querySelector("button")?.focus()
    } else if (lostFocus()) {
      // A removed row, Clear all, or Apply (rows remount under new ids) dropped it.
      addRef.current?.focus()
    }
  }, [ids])

  return (
    <form
      data-slot="filter-builder-panel"
      aria-label={messages.actions.open}
      className={cn("flex flex-col gap-3", className)}
      onSubmit={(event) => {
        event.preventDefault()
        // React events cross portals, so an enclosing form would submit too.
        event.stopPropagation()
        apply()
        onApply?.()
      }}
    >
      {state.rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.empty.rules}</p>
      ) : (
        <div ref={listRef} className="flex flex-col gap-2">
          {state.rules.map((rule, index) => (
            <div key={rule.id} className="flex items-start gap-2">
              <div className="flex h-7 w-16 shrink-0 items-center text-sm text-muted-foreground">
                {index === 0 ? (
                  messages.join.where
                ) : index === 1 && allowJoinToggle ? (
                  <FilterJoinSelect
                    value={state.join}
                    onValueChange={setJoin}
                  />
                ) : (
                  messages.join[state.join]
                )}
              </div>
              <FilterRuleRow
                rule={rule}
                valueInput={valueInput}
                className="flex-1"
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          ref={addRef}
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canAddRule}
          onClick={() => {
            added.current = true
            addRule()
          }}
        >
          <PlusIcon />
          {messages.actions.addRule}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={state.rules.length === 0 && !isDirty}
          onClick={reset}
        >
          {messages.actions.clearAll}
        </Button>
        <Button type="submit" size="sm" disabled={!isDirty}>
          {messages.actions.apply}
        </Button>
      </div>
    </form>
  )
}
