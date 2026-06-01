# PRD — Task Notification Preferences

**Status:** Draft for review · **Date:** 2026-06-01 · **Author:** dwntgrnd (with Claude)
**Scope:** Requirements only. No execution. Planning + implementation happen in a separate session.

---

## 1. Background & Current State

JamWork sends an email to task assignees today, but the behavior is **all-or-nothing**:

- Email is sent **unconditionally** to every *newly-added* assignee, excluding self-assignment.
- Triggered on `POST /tasks` (create) and `PUT /tasks/{id}` (update) — `api/src/Routes/TaskRoutes.php` (~393–442 and ~844–896).
- Sent via PHPMailer over SMTP; gracefully skipped when `Mailer::isConfigured()` is false.
- There is **no** user preference, **no** per-task control, and **no** project-level control.
- The settings page (`client/src/pages/settings.tsx`) has Profile / Appearance / Password — nothing for notifications.

This PRD adds **control on top of that all-or-nothing system** without silently dropping notifications anyone currently relies on.

---

## 2. Goals

- Let each user control **which** task emails they receive (receiver-side preference).
- Let a single task be **silenced for everyone** (task-wide flag).
- Let a project set a **sensible default** for the task-wide flag on newly created tasks.
- **Preserve today's behavior by default** — no regressions, no silent loss of notifications.

## 3. Non-Goals (this iteration)

- Due-date / overdue reminders (requires a scheduled job — deliberately deferred).
- Channels other than email (in-app, push, Slack).
- Digests, batching, or quiet hours.
- **Per-user default for the task-wide flag** — explicitly rejected (see §5 rationale).
- Per-user per-task mute/subscribe — the chosen model is a task-*wide* flag, not per-user muting.
- "Why didn't I get notified?" diagnostics tooling.

---

## 4. The Three Control Layers

Notification behavior is governed by three independent layers, each owned by a different party:

| Layer | Owner | Scope of effect | Default |
|---|---|---|---|
| **Project default** | Project owner / admin | Seeds the task flag for *new* tasks in the project | ON |
| **Task-wide flag** | Anyone who can edit the task | The task — affects **all** recipients | = project default at creation |
| **User per-event toggles** | The individual user | Only **that user's** inbox | All ON |

### Why these three, and why no per-user creator default

There are two genuinely different preferences, and they must live in different places:

1. **"Do *I* want to receive these?"** — receiver-side. Only affects you → belongs in **user settings** (the per-event toggles). Safe and predictable.
2. **"Should the tasks notify other people?"** — broadcast-side. Affects *others* → belongs on the **task** (and its **project** default), where it is **visible and shared**.

A per-user default for the task-wide flag was considered and **rejected** because it creates *spooky action at a distance*: the task flag affects everyone, but its initial value would be set by a hidden attribute of whoever happened to create the task. Identical tasks would behave differently for invisible reasons, and "why is this task silent?" would be undebuggable. **Project-level default solves the same need (quiet-by-default tasks) while staying visible, shared, and consistent.**

---

## 5. The Send Decision (Precedence)

An email for **event E**, to **user U**, about **task T**, is sent **if and only if ALL** of the following hold:

1. `Mailer::isConfigured()` is true.
2. Task T's notification flag is **ON**.
3. User U's per-event toggle for **E** is **ON**.
4. U is a valid recipient for E per §6 **and** U is **not the actor** who caused the event.
5. U has a valid email address.

This is pure **AND** composition — **any single layer can suppress** the email, and no layer can force an email past another layer's opt-out. This keeps the rule explainable in one sentence and testable in one place.

---

## 6. Events In Scope & Recipient Rules

| Event | Recipients | Notes |
|---|---|---|
| **Assigned to a task** | Newly-added assignees, excluding self-add | Existing behavior, now gated by the layers above |
| **Unassigned / reassigned** | The removed user, unless they removed themselves | New |
| **Task you're on changed** | Current assignees, excluding the editor | New — only fires on *significant* field changes (§7). The creator is **not** notified unless they are also an assignee. |

> Reassignment (remove A, add B in one save) = A receives **Unassigned**, B receives **Assigned**.

---

## 7. "Significant Fields" for the *Task Changed* Event

To avoid spamming everyone on trivial edits, *Task changed* fires only when a defined set of fields changes.

- **Significant set (confirmed):** `status`, `due date`, `priority`.
- **Explicitly excluded:** `title` (rename treated as cosmetic), description / notes, checklist items, ordering/position, the notification flag itself, and other metadata.

---

## 8. Single-Save Event Resolution (Dedupe)

A single `PUT /tasks/{id}` can simultaneously add assignees, remove assignees, **and** change fields. Each affected user must receive **at most one email per save**, resolved by priority:

1. **Newly added** → *Assigned* (suppress any *Changed* email for that same user/save).
2. **Else removed** → *Unassigned*.
3. **Else still assigned AND a significant field changed** → *Task changed*.

The actor (editor) is **never** notified about their own action.

---

## 9. Surfaces (UI + API)

### 9.1 User settings — `client/src/pages/settings.tsx`
- New **"Notifications"** card with three toggles:
  - *Assigned to me*
  - *Removed from a task*
  - *Updates to my tasks*
- Label the section **"Email notifications"** so future channels can slot in without renaming.
- **Defaults: all ON.** Migration backfills existing users to ON.
- **Scope: global per user** (single-workspace app — no per-workspace scoping).
- **Storage: three discrete boolean columns** on `users` (e.g. `notify_assigned`, `notify_unassigned`, `notify_changed`), each `DEFAULT 1`. Matches the existing discrete-column style of the `users` table.
- API: extend `PUT /auth/profile` (or a dedicated endpoint). Persisted on the `users` table.

### 9.2 Task-wide flag — task editor
- Control: **"Email notifications for this task" (on/off)**.
- Initialized to the **project default** at creation.
- Editable by anyone who can edit the task (= any authenticated user today; no new permission gate).
- **Changing this flag is not itself a notifiable change.**
- Stored on the `tasks` table.

### 9.3 Project default — project settings
- Setting: **"Default email notifications for new tasks" (on/off)**, default **ON**.
- Applied **only at task creation** to seed the task flag.
- **Not retroactive** — changing the project default never alters existing tasks.
- **Editable by any authenticated member**, consistent with today's unrestricted project editing (no per-project ownership/roles exist). No new permission gate is introduced.

---

## 10. Edge Cases & Defined Behavior

| # | Situation | Behavior |
|---|---|---|
| 1 | Self-assignment / self-removal | Never notify the actor (existing behavior preserved) |
| 2 | Assigner stays on the task | Not a *new* assignee → no *Assigned* email |
| 3 | Reassignment (remove A, add B) in one save | A → *Unassigned*, B → *Assigned* |
| 4 | Task flag is OFF | Suppresses **all three** event types for that task, including *Unassigned* — silence is total and consistent |
| 5 | Toggling the task flag or project default | Not a notifiable change |
| 6 | Mailer not configured | Skip silently (existing); log the skip |
| 7 | Missing / invalid recipient email | Skip + log; never block the task write |
| 8 | Multiple new assignees in one save | Each receives exactly one *Assigned* email |
| 9 | Editor is the sole assignee editing their own task | No email to anyone |
| 10 | Recurring-task instantiation | **Do NOT email** for system-generated occurrences (the original assignment already notified the assignee). A genuinely new assignee added via a normal edit still follows standard *Assigned* rules. |
| 11 | Bulk operations (if any path exists) | Apply per-recipient dedupe; consider a soft cap + log to prevent fan-out floods (risk flagged) |
| 12 | New users / new projects | Default ON; migration backfills existing rows to ON |
| 13 | Notification write failure | Never block or roll back the task operation; log only (existing pattern) |

---

## 11. Architecture Notes (light — execution is a separate session)

- The send logic is currently **duplicated** in `POST /tasks` and `PUT /tasks/{id}`. Recommend consolidating into a **single notification decision function / `NotificationService`** that takes `(event, task, actor, candidateRecipients)` and applies the §5 IFF rule + §8 dedupe in one place. This prevents the two paths from drifting and makes the three-layer precedence unit-testable.
- **Data model additions (illustrative):**
  - `users`: three discrete booleans — `notify_assigned`, `notify_unassigned`, `notify_changed` — each `TINYINT(1) DEFAULT 1`.
  - `tasks`: `notify_enabled TINYINT(1)` (seeded from the project default at creation).
  - `projects`: `default_notify_enabled TINYINT(1) DEFAULT 1`.
  - Migrations (004+) backfill all existing rows to **ON**.
- **Future channels:** if email + in-app + push are added later, migrate the three `users` booleans into a normalized `notification_preferences` table (`user_id, event_type, channel, enabled`). Out of scope now (YAGNI), noted so the column choice isn't mistaken for a permanent ceiling.
- Optional nicety: a "Manage notifications" / unsubscribe deep-link in the email footer → settings page. Out of scope unless cheap.

---

## 12. Resolved Decisions

All open decisions were resolved during brainstorming (2026-06-01):

1. **Significant-fields set** for *Task changed* → **`status`, `due date`, `priority`**. `title` excluded as cosmetic.
2. **Notify creator on change** → **No** — assignees only (unless the creator is also an assignee).
3. **Recurring-task occurrences** → **No email** for system-generated occurrences.
4. **Permissions** → **(a)** task-wide flag editable by anyone who can edit the task; **(b)** project default editable by any authenticated member. No new permission gates; existing member/admin asymmetry (only workspace settings are admin-gated) is preserved.
5. **Settings storage shape** → **Three discrete boolean columns** on `users`.
6. **Preference scope** → **Global per user** (confirmed single-workspace app).

*No remaining open decisions — ready for planning.*

---

## 13. Success Criteria

- Default behavior is **unchanged** for all existing users, projects, and tasks.
- Each of the three layers **independently and correctly** suppresses email.
- **No user receives more than one email per save.**
- Every edge case in §10 has a defined, tested behavior.
- The send decision lives in **one** place and matches §5 exactly.
