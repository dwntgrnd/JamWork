import { Draggable } from "@hello-pangea/dnd";
import { Link } from "react-router";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { ChevronRight, ChevronDown, Check, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { DueDatePicker } from "@/components/due-date-picker";
import {
  getStatusChipClasses,
  getPriorityDotColor,
  getEffortBadgeClasses,
} from "@/lib/style-tokens";
import {
  Task,
  Subtask,
  UserSummary,
  STATUS_LABELS,
  PRIORITY_LABELS,
  EFFORT_LABELS,
} from "@/types";
import { SubtaskSection } from "@/components/subtask-section";

type InlineEditField =
  | "status"
  | "priority"
  | "effort"
  | "dueDate"
  | "assigneeIds";

interface TaskTableRowProps {
  task: Task;
  index: number;
  isDragEnabled: boolean;
  showProjectColumn: boolean;
  isExpanded: boolean;
  isFocused: boolean;
  isSelected: boolean;
  savingFields: Set<string>;
  users: UserSummary[];
  newSubtaskTitle: string;
  isAddingSubtask: boolean;
  subtaskInputRef: (el: HTMLInputElement | null) => void;
  onRowClick: () => void;
  onCheckboxClick: (shiftKey: boolean) => void;
  onToggleExpand: () => void;
  onInlineEdit: (
    field: InlineEditField,
    value: string | number | null | string[],
  ) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onSubtaskTitleChange: (value: string) => void;
  onSubtaskInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const getFirstName = (displayName?: string) => displayName?.split(" ")[0] || "?";

/** A single draggable task row with inline-editable status/priority/effort/assignee/due-date. */
export function TaskTableRow({
  task,
  index,
  isDragEnabled,
  showProjectColumn,
  isExpanded,
  isFocused,
  isSelected,
  savingFields,
  users,
  newSubtaskTitle,
  isAddingSubtask,
  subtaskInputRef,
  onRowClick,
  onCheckboxClick,
  onToggleExpand,
  onInlineEdit,
  onToggleSubtask,
  onSubtaskTitleChange,
  onSubtaskInputKeyDown,
}: TaskTableRowProps) {
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  return (
    <Draggable
      draggableId={task.id}
      index={index}
      isDragDisabled={!isDragEnabled}
    >
      {(provided, snapshot) => (
        <TableRow
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "group cursor-pointer border-b border-border hover:bg-muted/50 hover:shadow-sm transition-all duration-150",
            isFocused && "ring-2 ring-ring",
            snapshot.isDragging && "shadow-lg bg-card",
          )}
          onClick={onRowClick}
        >
          {isDragEnabled && (
            <TableCell
              {...provided.dragHandleProps}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </TableCell>
          )}
          <TableCell onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onCheckboxClick(false)}
              onClick={(e) => {
                e.stopPropagation();
                onCheckboxClick(e.shiftKey);
              }}
              className="transition-colors"
            />
          </TableCell>

          {/* Expand/collapse caret */}
          <TableCell className="px-0">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 w-6 p-0 shrink-0 transition-opacity",
                hasSubtasks ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
              aria-label={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
              aria-expanded={isExpanded}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </TableCell>

          {/* Title */}
          <TableCell className="max-w-0 w-[35%]">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-left hover:text-interactive text-sm font-semibold truncate",
                  task.status === "done" && "line-through text-muted-foreground",
                )}
                title={task.title}
              >
                {task.title}
              </span>
              {hasSubtasks && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  {completedSubtasks}/{totalSubtasks}
                </Badge>
              )}
            </div>

            {/* Expanded subtask section */}
            {isExpanded && (
              <SubtaskSection
                subtasks={task.subtasks || []}
                newSubtaskTitle={newSubtaskTitle}
                isAddingSubtask={isAddingSubtask}
                inputRef={subtaskInputRef}
                onToggleSubtask={onToggleSubtask}
                onTitleChange={onSubtaskTitleChange}
                onInputKeyDown={onSubtaskInputKeyDown}
              />
            )}
          </TableCell>

          {/* Due Date - inline editable */}
          <TableCell className="hidden sm:table-cell">
            <div onClick={(e) => e.stopPropagation()}>
              <DueDatePicker
                value={task.dueDate}
                status={task.status}
                onChange={(v) =>
                  onInlineEdit("dueDate", v ? new Date(v).toISOString() : null)
                }
                triggerClassName="h-7 px-1"
                labelClassName="text-xs"
              />
              {savingFields.has(`${task.id}-dueDate`) && (
                <Check className="h-3 w-3 text-success inline-block ml-1" />
              )}
            </div>
          </TableCell>

          {/* Status - inline editable */}
          <TableCell>
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Select
                value={task.status}
                onValueChange={(value) => onInlineEdit("status", value)}
              >
                <SelectTrigger
                  className={cn(
                    "h-7 w-30 border-none",
                    getStatusChipClasses(task.status),
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">{STATUS_LABELS.todo}</SelectItem>
                  <SelectItem value="in_progress">
                    {STATUS_LABELS.in_progress}
                  </SelectItem>
                  <SelectItem value="blocked">{STATUS_LABELS.blocked}</SelectItem>
                  <SelectItem value="review">{STATUS_LABELS.review}</SelectItem>
                  <SelectItem value="done">{STATUS_LABELS.done}</SelectItem>
                </SelectContent>
              </Select>
              {savingFields.has(`${task.id}-status`) && (
                <Check className="h-3 w-3 text-success" />
              )}
            </div>
          </TableCell>

          {/* Priority - inline editable */}
          <TableCell>
            <div
              className="flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {getPriorityDotColor(task.priority) && (
                <div
                  className={cn(
                    "h-2.5 w-2.5 rounded-full shrink-0",
                    getPriorityDotColor(task.priority),
                  )}
                />
              )}
              <Select
                value={task.priority}
                onValueChange={(value) => onInlineEdit("priority", value)}
              >
                <SelectTrigger className="h-7 text-xs border-none bg-transparent px-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
                  <SelectItem value="medium">{PRIORITY_LABELS.medium}</SelectItem>
                  <SelectItem value="high">{PRIORITY_LABELS.high}</SelectItem>
                  <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
                </SelectContent>
              </Select>
              {savingFields.has(`${task.id}-priority`) && (
                <Check className="h-3 w-3 text-success" />
              )}
            </div>
          </TableCell>

          {/* Effort - inline editable */}
          <TableCell className="hidden lg:table-cell">
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Select
                value={task.effort ? task.effort.toString() : "none"}
                onValueChange={(v) =>
                  onInlineEdit("effort", v === "none" ? null : parseInt(v))
                }
              >
                <SelectTrigger
                  className={cn(
                    "h-7 w-auto min-w-0 gap-0.5 px-2 border-none text-xs",
                    task.effort
                      ? getEffortBadgeClasses(task.effort)
                      : "text-muted-foreground/50",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="1">{EFFORT_LABELS[1]}</SelectItem>
                  <SelectItem value="2">{EFFORT_LABELS[2]}</SelectItem>
                  <SelectItem value="4">{EFFORT_LABELS[4]}</SelectItem>
                  <SelectItem value="8">{EFFORT_LABELS[8]}</SelectItem>
                </SelectContent>
              </Select>
              {savingFields.has(`${task.id}-effort`) && (
                <Check className="h-3 w-3 text-success" />
              )}
            </div>
          </TableCell>

          {/* Assignees - inline editable */}
          <TableCell className="hidden md:table-cell">
            <div onClick={(e) => e.stopPropagation()}>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1 text-sm h-7 px-1 rounded hover:bg-muted/50 transition-colors",
                      task.assignees && task.assignees.length > 0
                        ? "text-foreground"
                        : "text-muted-foreground/50",
                    )}
                  >
                    {task.assignees && task.assignees.length > 0 ? (
                      <span className="truncate max-w-[80px]">
                        {getFirstName(task.assignees[0]?.user?.displayName)}
                        {task.assignees.length > 1 && (
                          <span className="text-muted-foreground ml-1">
                            +{task.assignees.length - 1}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>&mdash;</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" align="start">
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {users.map((u) => {
                      const isAssigned =
                        task.assignees?.some((a) => a.userId === u.id) || false;
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={isAssigned}
                            onCheckedChange={() => {
                              const currentIds =
                                task.assignees?.map((a) => a.userId) || [];
                              const newIds = isAssigned
                                ? currentIds.filter((id) => id !== u.id)
                                : [...currentIds, u.id];
                              onInlineEdit("assigneeIds", newIds);
                            }}
                          />
                          <span>{u.displayName}</span>
                        </label>
                      );
                    })}
                  </div>
                  {task.assignees && task.assignees.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-1 text-xs text-muted-foreground"
                      onClick={() => onInlineEdit("assigneeIds", [])}
                    >
                      Clear all
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
              {savingFields.has(`${task.id}-assigneeIds`) && (
                <Check className="h-3 w-3 text-success inline-block ml-1" />
              )}
            </div>
          </TableCell>

          {/* Project */}
          {showProjectColumn && (
            <TableCell className="hidden lg:table-cell">
              {task.project ? (
                <Link
                  to={`/projects/${task.project.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline truncate block max-w-[160px]"
                  title={task.project.name}
                >
                  {task.project.name}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground/50">&mdash;</span>
              )}
            </TableCell>
          )}
        </TableRow>
      )}
    </Draggable>
  );
}
