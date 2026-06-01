<?php

namespace JamWork\Lib;

use PDO;

/**
 * Single decision point for task notification emails (PRD 2026-06-01).
 *
 * Implements the §5 send rule as pure AND composition — an email for event E, to user U,
 * about task T is sent iff: mailer configured AND task flag ON AND U's per-event toggle ON
 * AND U is a valid, non-actor recipient AND U has a valid email — and the §8 single-save
 * dedupe so each affected user receives at most one email per save.
 *
 * Never throws into the caller: a notification failure must never block or roll back the
 * task write (PRD §10.13). All errors are logged and swallowed.
 */
class NotificationService
{
    public const EVENT_ASSIGNED   = 'assigned';
    public const EVENT_UNASSIGNED = 'unassigned';
    public const EVENT_CHANGED    = 'changed';

    /**
     * @param array  $task              Task row; needs id, title, project_id, notify_enabled.
     * @param string $actorId           The user who caused the event (never notified).
     * @param array  $oldAssigneeIds    Assignee user IDs before the save (empty on create).
     * @param array  $newAssigneeIds    Assignee user IDs after the save.
     * @param bool   $significantChanged Whether a §7 significant field changed this save.
     * @param bool   $isCreate          True for POST /tasks (no unassign/changed events).
     */
    public static function dispatchForTaskSave(
        PDO $db,
        array $task,
        string $actorId,
        array $oldAssigneeIds,
        array $newAssigneeIds,
        bool $significantChanged,
        bool $isCreate
    ): void {
        try {
            // §5.1 — mailer must be configured (cheap early-out before any DB work).
            $mailerConfigured = Mailer::isConfigured();
            if (!$mailerConfigured) {
                error_log('Notification skipped: mailer not configured (task ' . ($task['id'] ?? '?') . ')');
                return;
            }

            // §5.2 / §10.4 — task flag OFF suppresses ALL events for this task.
            $taskNotifyEnabled = (bool) ($task['notify_enabled'] ?? 1);
            if (!$taskNotifyEnabled) {
                return;
            }

            // §8 — resolve at most one event per recipient; the actor is never notified.
            $recipientEvents = self::resolveEvents(
                $actorId,
                $oldAssigneeIds,
                $newAssigneeIds,
                $significantChanged,
                $isCreate
            );

            if (empty($recipientEvents)) {
                return;
            }

            // Batch-fetch candidate recipients incl. their per-event toggles.
            $userIds = array_keys($recipientEvents);
            $placeholders = implode(',', array_fill(0, count($userIds), '?'));
            $stmt = $db->prepare(
                "SELECT id, email, display_name, notify_assigned, notify_unassigned, notify_changed
                 FROM users WHERE id IN ({$placeholders})"
            );
            $stmt->execute(array_values($userIds));
            $users = [];
            foreach ($stmt->fetchAll() as $row) {
                $users[$row['id']] = $row;
            }

            // Shared context (assigner/editor name, project name, workspace name, URL).
            $actorName = self::lookupDisplayName($db, $actorId) ?: 'Someone';
            $projectName = self::lookupProjectName($db, $task['project_id']) ?: 'Unknown Project';
            $workspaceName = self::lookupWorkspaceName($db) ?: 'JamWork';
            $taskUrl = ($_ENV['APP_URL'] ?? '')
                . '/projects/' . $task['project_id'] . '?task=' . $task['id'];
            $taskTitle = $task['title'] ?? '';

            $mailer = new Mailer();

            foreach ($recipientEvents as $userId => $event) {
                $user = $users[$userId] ?? null;
                if (!$user) {
                    continue;
                }

                // §5 — the authoritative AND composition (recipient/non-actor already applied by §8).
                if (!self::passesSendRule($mailerConfigured, $taskNotifyEnabled, $user, $event)) {
                    if (!filter_var($user['email'] ?? '', FILTER_VALIDATE_EMAIL)) {
                        error_log('Notification skipped: invalid email for user ' . $userId);
                    }
                    continue;
                }

                $email = $user['email'];
                $displayName = $user['display_name'] ?? '';
                $result = match ($event) {
                    self::EVENT_ASSIGNED => $mailer->sendTaskAssignmentEmail(
                        $email, $displayName, $actorName, $taskTitle, $projectName, $taskUrl, $workspaceName
                    ),
                    self::EVENT_UNASSIGNED => $mailer->sendTaskUnassignedEmail(
                        $email, $displayName, $actorName, $taskTitle, $projectName, $taskUrl, $workspaceName
                    ),
                    self::EVENT_CHANGED => $mailer->sendTaskChangedEmail(
                        $email, $displayName, $actorName, $taskTitle, $projectName, $taskUrl, $workspaceName
                    ),
                    default => ['sent' => false, 'error' => 'unknown event'],
                };

                if (!$result['sent']) {
                    error_log("Task {$event} email failed for user {$userId}: " . ($result['error'] ?? ''));
                }
            }
        } catch (\Exception $e) {
            // §10.13 — never propagate; the task write already committed.
            error_log('Notification dispatch error: ' . $e->getMessage());
        }
    }

    /**
     * §5 — the send rule as pure AND composition, for a single (user, event).
     * §5.4 (valid non-actor recipient) is already applied by resolveEvents, so this composes
     * the remaining factors: mailer configured AND task flag ON AND per-user toggle ON AND
     * the user has a valid email. Pure and side-effect-free → tested in isolation.
     */
    public static function passesSendRule(
        bool $mailerConfigured,
        bool $taskNotifyEnabled,
        array $user,
        string $event
    ): bool {
        return $mailerConfigured
            && $taskNotifyEnabled
            && self::toggleEnabled($user, $event)
            && (bool) filter_var($user['email'] ?? '', FILTER_VALIDATE_EMAIL);
    }

    /**
     * §8 dedupe — map each affected (non-actor) user to exactly one event.
     * added → Assigned; removed → Unassigned; still-assigned + significant change → Changed.
     * The three sets are disjoint, so no user maps to more than one event.
     *
     * @return array<string,string> userId => event
     */
    public static function resolveEvents(
        string $actorId,
        array $oldAssigneeIds,
        array $newAssigneeIds,
        bool $significantChanged,
        bool $isCreate
    ): array {
        $old = array_values(array_unique($oldAssigneeIds));
        $new = array_values(array_unique($newAssigneeIds));

        $added = array_diff($new, $old, [$actorId]);
        $events = [];
        foreach ($added as $id) {
            $events[$id] = self::EVENT_ASSIGNED;
        }

        if ($isCreate) {
            return $events;
        }

        $removed = array_diff($old, $new, [$actorId]);
        foreach ($removed as $id) {
            $events[$id] = self::EVENT_UNASSIGNED;
        }

        if ($significantChanged) {
            $stillAssigned = array_diff(array_intersect($old, $new), [$actorId]);
            foreach ($stillAssigned as $id) {
                $events[$id] = self::EVENT_CHANGED;
            }
        }

        return $events;
    }

    private static function toggleEnabled(array $user, string $event): bool
    {
        $column = match ($event) {
            self::EVENT_ASSIGNED   => 'notify_assigned',
            self::EVENT_UNASSIGNED => 'notify_unassigned',
            self::EVENT_CHANGED    => 'notify_changed',
            default                => null,
        };
        if ($column === null) {
            return false;
        }
        return (bool) ($user[$column] ?? 0);
    }

    private static function lookupDisplayName(PDO $db, string $userId): ?string
    {
        $stmt = $db->prepare('SELECT display_name FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $name = $stmt->fetchColumn();
        return $name !== false ? $name : null;
    }

    private static function lookupProjectName(PDO $db, string $projectId): ?string
    {
        $stmt = $db->prepare('SELECT name FROM projects WHERE id = ?');
        $stmt->execute([$projectId]);
        $name = $stmt->fetchColumn();
        return $name !== false ? $name : null;
    }

    private static function lookupWorkspaceName(PDO $db): ?string
    {
        $stmt = $db->prepare("SELECT value FROM workspace_settings WHERE `key` = 'workspace_name'");
        $stmt->execute();
        $name = $stmt->fetchColumn();
        return $name !== false ? $name : null;
    }
}
