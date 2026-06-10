// Status Report types — the CC30a API response + payload rendering contract.
// The payload is produced fully grouped/ordered/computed by the backend; the
// frontend is a blind renderer. Access fields by key, never by position.

/** The user who triggered a report, or null if that user has since departed. */
export interface ReportTriggeredBy {
  id: string;
  displayName: string;
}

/** Archive list entry — GET /reports. */
export interface ReportSummary {
  id: string;
  generatedAt: string; // ISO 8601
  type: string; // "ad_hoc" | "scheduled"
  triggeredBy: ReportTriggeredBy | null;
}

/** A global milestone inside the report payload. */
export interface ReportMilestone {
  name: string;
  date: string; // ISO 8601
}

/** A task assignee inside the report payload. */
export interface ReportAssignee {
  id: string;
  name: string;
}

/** A single task line inside a status group. */
export interface ReportTask {
  id: string;
  title: string;
  assignees: ReportAssignee[];
  dueDate: string | null;
  overdue: boolean;
  subtasks: { completed: number; total: number } | null;
}

/** A status group within a project (label pre-resolved by the backend). */
export interface ReportGroup {
  status: string; // token, e.g. "blocked"
  label: string; // pre-resolved display label, e.g. "Blocked"
  tasks: ReportTask[];
}

/** A project section within the report payload. */
export interface ReportProject {
  id: string;
  name: string;
  hasTasks: boolean;
  groups: ReportGroup[];
}

/** Empty-state copy embedded in every payload — render verbatim. */
export interface ReportCopy {
  noProjects: string;
  noActiveTasks: string;
  noMilestones: string;
  unassigned: string;
}

/** The stored payload — the rendering contract. Walk in the order given. */
export interface ReportPayload {
  generatedAt: string; // ISO 8601
  windowDays: number;
  milestoneHorizonDays: number;
  milestones: ReportMilestone[];
  projects: ReportProject[];
  projectsEmpty: boolean;
  copy: ReportCopy;
}

/** Full stored object — GET /reports/{id}. */
export interface ReportDetail {
  id: string;
  generatedAt: string; // ISO 8601
  type: string;
  triggeredBy: ReportTriggeredBy | null;
  windowDays: number;
  payload: ReportPayload;
}
