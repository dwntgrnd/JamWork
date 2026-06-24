// Core entity types matching Prisma schema

export type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type UserRole = "owner" | "admin" | "member";

/** True for roles with admin-page access (owner and admin). */
export function isAdminOrOwner(role: string | undefined): boolean {
  return role === "admin" || role === "owner";
}
export type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly";
export type TaskEffort = 1 | 2 | 4 | 8;
export type SprintStatus = "active" | "completed";

// Display labels for status and priority
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const EFFORT_LABELS: Record<number, string> = { 1: 'S', 2: 'M', 4: 'L', 8: 'XL' };

// Full user (auth context, admin panel)
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  mustResetPassword?: boolean;
  notifyAssigned?: boolean;
  notifyUnassigned?: boolean;
  notifyChanged?: boolean;
  createdAt?: string;
}

// User summary for relations
export interface UserSummary {
  id: string;
  email?: string;
  displayName: string;
  role: UserRole;
}

// Project
export interface Project {
  id: string;
  name: string;
  description?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  sprintPlanning?: boolean;
  defaultNotifyEnabled?: boolean;
  includeInStatusReport?: boolean;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    tasks: number;
  };
}

// Label
export interface Label {
  id: string;
  name: string;
  color: string;
  createdById: string;
  createdAt: Date | string;
}

// Subtask
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  sortOrder: number;
  taskId: string;
  createdAt: Date | string;
}

// Task relations
export interface TaskAssignee {
  id: string;
  taskId: string;
  userId: string;
  assignedAt: Date | string;
  user?: UserSummary;
}

export interface TaskLabel {
  id: string;
  taskId: string;
  labelId: string;
  label?: Label;
}

export interface TaskLink {
  id: string;
  title?: string;
  url: string;
  taskId: string;
  createdById: string;
  createdAt: Date | string;
}

// Sprint
export interface Sprint {
  id: string;
  name: string;
  description?: string;
  startDate: Date | string;
  endDate: Date | string;
  status: SprintStatus;
  projectId?: string | null;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  project?: {
    id: string;
    name: string;
  };
  _count?: {
    tasks: number;
  };
  stats?: {
    taskCount: number;
    completedCount: number;
  };
}

// Milestone
export interface Milestone {
  id: string;
  name: string;
  date: Date | string;
  projectId?: string;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Task (main entity)
export interface Task {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  effort?: TaskEffort | null;
  dueDate?: Date | string;
  startDate?: Date | string;
  sortOrder: number;
  recurrence?: RecurrenceType | null;
  notifyEnabled?: boolean;
  showOnTimeline?: boolean;
  includeInReport?: boolean;
  sprintId?: string | null;
  sprint?: {
    id: string;
    name: string;
    startDate: Date | string;
    endDate: Date | string;
    status: string;
  };
  projectId: string;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  assignees?: TaskAssignee[];
  labels?: TaskLabel[];
  subtasks?: Subtask[];
  links?: TaskLink[];
  creator?: UserSummary;
  project?: Project;
}

// Filter and sort state
export interface TaskFilterState {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  sprintId?: string | null;
  showCompleted: boolean;
  sortBy: "title" | "dueDate" | "status" | "priority" | "effort" | "sortOrder" | "createdAt";
  sortDir: "asc" | "desc";
}
