<?php

namespace Tests;

use PHPUnit\Framework\TestCase;
use JamWork\Lib\NotificationService as NS;

/**
 * Pure-logic tests for the task-notification decision functions (PRD §5/§7/§8/§10).
 * No DB, no network — exercises NS::resolveEvents() and NS::passesSendRule().
 */
final class NotificationServiceTest extends TestCase
{
    /** A user row with all toggles ON and a valid email. */
    private function userRow(string $id, array $overrides = []): array
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

    public function testResolveEventsSingleSaveDedupe(): void
    {
        // §10.1/§10.9 — actor is never notified (self-assignment on create).
        $this->assertSame([], NS::resolveEvents('actor', [], ['actor'], false, true));

        // Create: each new assignee (excluding actor) → Assigned (§10.8).
        $this->assertSame(
            ['a' => NS::EVENT_ASSIGNED, 'b' => NS::EVENT_ASSIGNED],
            NS::resolveEvents('actor', [], ['a', 'b', 'actor'], false, true)
        );

        // §10.3 — reassignment in one save: A removed → Unassigned, B added → Assigned.
        $this->assertSame(
            ['b' => NS::EVENT_ASSIGNED, 'a' => NS::EVENT_UNASSIGNED],
            NS::resolveEvents('actor', ['a'], ['b'], false, false)
        );

        // §10.2 — no field change, no assignee change → no events.
        $this->assertSame([], NS::resolveEvents('actor', ['actor', 'a'], ['actor', 'a'], false, false));

        // §7 — still-assigned + cosmetic change → no Changed.
        $this->assertSame([], NS::resolveEvents('actor', ['a', 'b'], ['a', 'b'], false, false));

        // §7 — still-assigned + significant change → Changed for both.
        $this->assertSame(
            ['a' => NS::EVENT_CHANGED, 'b' => NS::EVENT_CHANGED],
            NS::resolveEvents('actor', ['a', 'b'], ['a', 'b'], true, false)
        );

        // §10.9 — editor who is also an assignee is not notified of their own change.
        $this->assertSame(
            ['a' => NS::EVENT_CHANGED],
            NS::resolveEvents('actor', ['actor', 'a'], ['actor', 'a'], true, false)
        );

        // Dedupe priority: a newly-added user during a significant-change save gets Assigned, not Changed.
        $this->assertSame(
            ['b' => NS::EVENT_ASSIGNED, 'a' => NS::EVENT_CHANGED],
            NS::resolveEvents('actor', ['a'], ['a', 'b'], true, false)
        );
    }

    public function testPassesSendRuleAndComposition(): void
    {
        // All layers ON → send.
        $this->assertTrue(NS::passesSendRule(true, true, $this->userRow('a'), NS::EVENT_ASSIGNED));

        // §5.1 — mailer not configured suppresses.
        $this->assertFalse(NS::passesSendRule(false, true, $this->userRow('a'), NS::EVENT_ASSIGNED));

        // §5.2 / §10.4 — task flag OFF suppresses (including Unassigned).
        $this->assertFalse(NS::passesSendRule(true, false, $this->userRow('a'), NS::EVENT_UNASSIGNED));

        // §5.3 — each per-user toggle independently suppresses its own event.
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['notify_assigned' => 0]), NS::EVENT_ASSIGNED));
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['notify_unassigned' => 0]), NS::EVENT_UNASSIGNED));
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['notify_changed' => 0]), NS::EVENT_CHANGED));

        // A toggle being off only suppresses its own event, not the others.
        $this->assertTrue(NS::passesSendRule(true, true, $this->userRow('a', ['notify_changed' => 0]), NS::EVENT_ASSIGNED));

        // §5.5 / §10.7 — missing/invalid email suppresses + never throws.
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['email' => '']), NS::EVENT_ASSIGNED));
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['email' => 'not-an-email']), NS::EVENT_ASSIGNED));
    }
}
