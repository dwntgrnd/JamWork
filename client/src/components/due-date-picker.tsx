import { X } from "lucide-react";
import { getDateUrgencyInfo, parseLocalDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DueDatePickerProps {
  /** Due date as an ISO datetime, "YYYY-MM-DD", or Date; null/undefined when unset. */
  value?: string | Date | null;
  /** Task status — mutes done tasks and flags overdue in the urgency label. */
  status?: string;
  /** Emits the raw date value: "YYYY-MM-DD" when picked, "" when cleared. */
  onChange: (value: string) => void;
  /** Label shown when no date is set; defaults to the urgency em dash ("—"). */
  emptyLabel?: string;
  /** Classes for the trigger button. */
  triggerClassName?: string;
  /** Extra classes for the urgency label text. */
  labelClassName?: string;
  /** Render an inline × clear control next to the trigger when a date is set. */
  showInlineClear?: boolean;
  /** Popover alignment. */
  align?: "start" | "center" | "end";
}

/** Coerces a value to the "YYYY-MM-DD" string a native date input expects. */
function toInputValue(value?: string | Date | null): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date(value).toISOString().split("T")[0];
}

/**
 * Urgency-labeled due-date control: a trigger showing the graduated urgency
 * label that opens a date-picker popover with a clear action. Shared by the
 * task list row and the task drawer hero so both stay in sync.
 */
export function DueDatePicker({
  value,
  status,
  onChange,
  emptyLabel,
  triggerClassName,
  labelClassName,
  showInlineClear = false,
  align = "start",
}: DueDatePickerProps) {
  // Normalize through parseLocalDate so date-only values anchor to the local
  // calendar day (no UTC-midnight drift); ISO datetimes pass through unchanged,
  // preserving existing list/board behavior.
  const urgency = getDateUrgencyInfo(
    value ? parseLocalDate(value) : undefined,
    status,
  );
  const label = !value && emptyLabel ? emptyLabel : urgency.label;

  return (
    <span className="inline-flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "text-left rounded hover:bg-muted/50 transition-colors",
              triggerClassName,
            )}
          >
            <span
              className={cn(
                "whitespace-nowrap",
                value ? urgency.className : "text-muted-foreground",
                labelClassName,
              )}
            >
              {label}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align={align}>
          <div className="flex flex-col gap-2">
            <Input
              type="date"
              value={toInputValue(value)}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 text-sm"
            />
            {value && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => onChange("")}
              >
                Clear
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {showInlineClear && value && (
        <button
          type="button"
          aria-label="Clear due date"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => onChange("")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
