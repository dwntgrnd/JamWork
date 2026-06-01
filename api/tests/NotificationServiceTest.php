<?php

/**
 * Dependency-free tests for the task-notification decision logic (PRD §5/§7/§8/§10).
 *
 * This project has no test framework installed, so this is a minimal, self-contained
 * harness — no PHPUnit, no DB, no network. It exercises the two pure decision functions
 * that hold the entire send rule:
 *   - NotificationService::resolveEvents()  → §8 single-save dedupe
 *   - NotificationService::passesSendRule() → §5 AND composition (per-recipient layers)
 *
 * Run:  php tests/NotificationServiceTest.php
 */

require __DIR__ . '/../vendor/autoload.php';

use JamWork\Lib\NotificationService as NS;

$tests = 0;
$failures = 0;

function check(string $name, bool $cond): void
{
    global $tests, $failures;
    $tests++;
    if ($cond) {
        echo "  ok   - {$name}\n";
    } else {
        $failures++;
        echo "  FAIL - {$name}\n";
    }
}

/** Build a user row with all toggles defaulting ON and a valid email. */
function user(string $id, array $overrides = []): array
{
    return array_merge([
        'id' => $id,
        'email' => "{$id}@example.com",
        'display_name' => $id,
        'notify_assigned' => 1,
        'notify_unassigned' => 1,
        'notify_changed' => 1,
    ], $overrides);
}

echo "resolveEvents — §8 single-save dedupe\n";

// §10.1/§10.9 — actor is never notified (self-assignment on create).
$e = NS::resolveEvents('actor', [], ['actor'], false, true);
check('self-assignment on create notifies no one', $e === []);

// Create: each new assignee (excluding actor) → Assigned (§10.8 multiple assignees).
$e = NS::resolveEvents('actor', [], ['a', 'b', 'actor'], false, true);
check('create: a and b assigned, actor excluded',
    $e === ['a' => NS::EVENT_ASSIGNED, 'b' => NS::EVENT_ASSIGNED]);

// §10.3 — reassignment in one save: A removed → Unassigned, B added → Assigned.
$e = NS::resolveEvents('actor', ['a'], ['b'], false, false);
check('reassignment: A unassigned, B assigned',
    $e === ['b' => NS::EVENT_ASSIGNED, 'a' => NS::EVENT_UNASSIGNED]);

// §10.2 — assigner stays on the task and is the actor → no event for them.
$e = NS::resolveEvents('actor', ['actor', 'a'], ['actor', 'a'], false, false);
check('no field change, no assignee change → no events', $e === []);

// §7 — still-assigned users get Changed ONLY when a significant field changed.
$e = NS::resolveEvents('actor', ['a', 'b'], ['a', 'b'], false, false);
check('still-assigned + cosmetic change → no Changed', $e === []);

$e = NS::resolveEvents('actor', ['a', 'b'], ['a', 'b'], true, false);
check('still-assigned + significant change → Changed for both',
    $e === ['a' => NS::EVENT_CHANGED, 'b' => NS::EVENT_CHANGED]);

// Editor who is also an assignee is never notified about their own change (§10.9).
$e = NS::resolveEvents('actor', ['actor', 'a'], ['actor', 'a'], true, false);
check('significant change: actor excluded, other assignee Changed',
    $e === ['a' => NS::EVENT_CHANGED]);

// Dedupe priority: a newly-added user during a significant-change save gets Assigned, not Changed.
$e = NS::resolveEvents('actor', ['a'], ['a', 'b'], true, false);
check('added user gets Assigned even when a significant field also changed',
    $e === ['b' => NS::EVENT_ASSIGNED, 'a' => NS::EVENT_CHANGED]);

echo "passesSendRule — §5 AND composition\n";

// All layers ON → send.
check('all layers on → send',
    NS::passesSendRule(true, true, user('a'), NS::EVENT_ASSIGNED) === true);

// §5.1 — mailer not configured suppresses.
check('mailer off → suppress',
    NS::passesSendRule(false, true, user('a'), NS::EVENT_ASSIGNED) === false);

// §5.2 / §10.4 — task flag OFF suppresses (including Unassigned).
check('task flag off → suppress unassigned too',
    NS::passesSendRule(true, false, user('a'), NS::EVENT_UNASSIGNED) === false);

// §5.3 — each per-user toggle independently suppresses its own event.
check('notify_assigned off → suppress assigned',
    NS::passesSendRule(true, true, user('a', ['notify_assigned' => 0]), NS::EVENT_ASSIGNED) === false);
check('notify_unassigned off → suppress unassigned',
    NS::passesSendRule(true, true, user('a', ['notify_unassigned' => 0]), NS::EVENT_UNASSIGNED) === false);
check('notify_changed off → suppress changed',
    NS::passesSendRule(true, true, user('a', ['notify_changed' => 0]), NS::EVENT_CHANGED) === false);

// A toggle being off only suppresses its own event, not the others.
check('notify_changed off does not suppress assigned',
    NS::passesSendRule(true, true, user('a', ['notify_changed' => 0]), NS::EVENT_ASSIGNED) === true);

// §5.5 / §10.7 — missing/invalid email suppresses + never throws.
check('empty email → suppress',
    NS::passesSendRule(true, true, user('a', ['email' => '']), NS::EVENT_ASSIGNED) === false);
check('garbage email → suppress',
    NS::passesSendRule(true, true, user('a', ['email' => 'not-an-email']), NS::EVENT_ASSIGNED) === false);

echo "\n{$tests} checks, {$failures} failure(s)\n";
exit($failures === 0 ? 0 : 1);
