<?php

namespace Tests\Integration;

use Ramsey\Uuid\Uuid;

/**
 * Per-user preferences store (CC37). GET returns {} (never null) for a user who
 * has never saved; PUT validates the sidebar namespace (view ∈ {all,mine},
 * pinnedProjects = array of UUIDs) and merges at the top-level key so unrelated
 * preference namespaces survive. Project IDs are CHAR(36) UUIDs — not integers —
 * and stale IDs are intentionally accepted (filtered client-side).
 */
final class UserPreferencesRoutesTest extends IntegrationTestCase
{
    private array $user;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->seedUser(['display_name' => 'Alice']);
        $this->token = $this->tokenFor($this->user);
    }

    // --- GET /user/preferences ---------------------------------------------

    public function testGetReturnsEmptyObjectWhenNoPreferences(): void
    {
        $res = $this->request('GET', '/user/preferences', null, $this->token);

        $this->assertSame(200, $res->getStatusCode());
        // Must be an object {}, not null and not [] — the client never handles null.
        $this->assertSame('{"preferences":{}}', (string) $res->getBody());
    }

    public function testGetReturnsStoredPreferences(): void
    {
        $p1 = $this->seedProject($this->user['id']);
        $this->setRawPreferences($this->user['id'], [
            'sidebar' => ['view' => 'mine', 'pinnedProjects' => [$p1]],
        ]);

        $res = $this->request('GET', '/user/preferences', null, $this->token);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame(
            ['preferences' => ['sidebar' => ['view' => 'mine', 'pinnedProjects' => [$p1]]]],
            $this->decode($res)
        );
    }

    public function testGetRequiresAuthentication(): void
    {
        $res = $this->request('GET', '/user/preferences');
        $this->assertSame(401, $res->getStatusCode());
    }

    // --- PUT /user/preferences ---------------------------------------------

    public function testPutStoresAndReturnsSidebarPreferences(): void
    {
        $p1 = $this->seedProject($this->user['id']);
        $p2 = $this->seedProject($this->user['id']);
        $body = ['sidebar' => ['view' => 'mine', 'pinnedProjects' => [$p1, $p2]]];

        $put = $this->request('PUT', '/user/preferences', $body, $this->token);
        $this->assertSame(200, $put->getStatusCode());
        $this->assertSame(['preferences' => $body], $this->decode($put));

        // Round-trips through storage.
        $get = $this->request('GET', '/user/preferences', null, $this->token);
        $this->assertSame(['preferences' => $body], $this->decode($get));
    }

    public function testPutAcceptsEmptyPinnedProjects(): void
    {
        $body = ['sidebar' => ['view' => 'all', 'pinnedProjects' => []]];
        $put = $this->request('PUT', '/user/preferences', $body, $this->token);

        $this->assertSame(200, $put->getStatusCode());
        $this->assertSame(['preferences' => $body], $this->decode($put));
    }

    public function testPutAcceptsStalePinnedUuids(): void
    {
        // A UUID that references no live project is valid input — it is filtered
        // out client-side, never rejected here (Decision: stale IDs are inert).
        $ghost = Uuid::uuid4()->toString();
        $body = ['sidebar' => ['view' => 'mine', 'pinnedProjects' => [$ghost]]];

        $put = $this->request('PUT', '/user/preferences', $body, $this->token);
        $this->assertSame(200, $put->getStatusCode());
        $this->assertSame(['preferences' => $body], $this->decode($put));
    }

    public function testPutRejectsInvalidView(): void
    {
        $res = $this->request('PUT', '/user/preferences', [
            'sidebar' => ['view' => 'custom', 'pinnedProjects' => []],
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testPutRejectsNonUuidPinnedProjects(): void
    {
        $res = $this->request('PUT', '/user/preferences', [
            'sidebar' => ['view' => 'mine', 'pinnedProjects' => ['not-a-uuid']],
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testPutRejectsIntegerPinnedProjects(): void
    {
        // The spec said "integers"; this codebase uses UUID strings, so integer
        // IDs must be rejected.
        $res = $this->request('PUT', '/user/preferences', [
            'sidebar' => ['view' => 'mine', 'pinnedProjects' => [1, 3, 7]],
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testPutRejectsNonArrayPinnedProjects(): void
    {
        $res = $this->request('PUT', '/user/preferences', [
            'sidebar' => ['view' => 'mine', 'pinnedProjects' => 'all'],
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testPutRejectsUnknownTopLevelKey(): void
    {
        // Only known namespaces are writable; an arbitrary top-level key is
        // rejected so the store can't become a dumping ground for client data.
        $res = $this->request('PUT', '/user/preferences', [
            'theme' => 'dark',
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testPutRejectsNonStringView(): void
    {
        // The shared `in:` rule skips non-scalars; the route guards the type so a
        // non-string view can't slip through as valid.
        $res = $this->request('PUT', '/user/preferences', [
            'sidebar' => ['view' => ['mine'], 'pinnedProjects' => []],
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testPutRejectsNonObjectSidebar(): void
    {
        $res = $this->request('PUT', '/user/preferences', [
            'sidebar' => 'nope',
        ], $this->token);
        $this->assertSame(400, $res->getStatusCode());
    }

    public function testPutMergesAtNamespaceLevel(): void
    {
        // A sibling top-level namespace must survive a sidebar update.
        $this->setRawPreferences($this->user['id'], [
            'theme' => 'dark',
            'sidebar' => ['view' => 'all', 'pinnedProjects' => []],
        ]);

        $p1 = $this->seedProject($this->user['id']);
        $put = $this->request('PUT', '/user/preferences', [
            'sidebar' => ['view' => 'mine', 'pinnedProjects' => [$p1]],
        ], $this->token);
        $this->assertSame(200, $put->getStatusCode());

        $get = $this->decode($this->request('GET', '/user/preferences', null, $this->token));
        $this->assertSame('dark', $get['preferences']['theme']);
        $this->assertSame(['view' => 'mine', 'pinnedProjects' => [$p1]], $get['preferences']['sidebar']);
    }

    public function testPutRequiresAuthentication(): void
    {
        $res = $this->request('PUT', '/user/preferences', [
            'sidebar' => ['view' => 'mine', 'pinnedProjects' => []],
        ]);
        $this->assertSame(401, $res->getStatusCode());
    }

    // --- Cross-user isolation ----------------------------------------------

    public function testPreferencesAreScopedToAuthenticatedUser(): void
    {
        $p1 = $this->seedProject($this->user['id']);
        $this->request('PUT', '/user/preferences', [
            'sidebar' => ['view' => 'mine', 'pinnedProjects' => [$p1]],
        ], $this->token);

        // A different user sees only their own (empty) preferences.
        $bob = $this->seedUser(['display_name' => 'Bob', 'email' => 'bob@example.com']);
        $bobToken = $this->tokenFor($bob);

        $res = $this->request('GET', '/user/preferences', null, $bobToken);
        $this->assertSame('{"preferences":{}}', (string) $res->getBody());

        // Alice still has hers.
        $alice = $this->decode($this->request('GET', '/user/preferences', null, $this->token));
        $this->assertSame([$p1], $alice['preferences']['sidebar']['pinnedProjects']);
    }

    private function setRawPreferences(string $userId, array $prefs): void
    {
        $stmt = $this->db->prepare('UPDATE users SET preferences = :p WHERE id = :id');
        $stmt->execute(['p' => json_encode($prefs), 'id' => $userId]);
    }
}
