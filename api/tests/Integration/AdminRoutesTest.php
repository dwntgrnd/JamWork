<?php

namespace Tests\Integration;

use Ramsey\Uuid\Uuid;

/**
 * Permission matrix for the multi-admin role model (CC31a). Every case is a
 * single caller × target × expected-outcome assertion, organized by endpoint.
 * The owner/admin/member trio is seeded per test so each case is self-contained.
 */
final class AdminRoutesTest extends IntegrationTestCase
{
    /** @return array{0:array,1:array,2:array} owner, admin, member */
    private function seedTrio(): array
    {
        return [
            $this->seedUser(['role' => 'owner', 'display_name' => 'Owner']),
            $this->seedUser(['role' => 'admin', 'display_name' => 'Admin']),
            $this->seedUser(['role' => 'member', 'display_name' => 'Member']),
        ];
    }

    private function roleOf(string $id): ?string
    {
        $stmt = $this->db->prepare('SELECT role FROM users WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row ? $row['role'] : null;
    }

    // --- Middleware access --------------------------------------------------

    public function testMemberCannotAccessAdminEndpoints(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('DELETE', '/admin/users/' . $owner['id'], null, $this->tokenFor($member));
        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('Admin access required', $this->decode($response)['error']);
    }

    public function testAdminCanAccessAdminEndpoints(): void
    {
        [, $admin] = $this->seedTrio();
        $response = $this->request('POST', '/admin/invite', [
            'email' => 'invitee@example.com',
            'displayName' => 'Invitee',
        ], $this->tokenFor($admin));
        $this->assertNotSame(403, $response->getStatusCode());
    }

    public function testOwnerCanAccessAdminEndpoints(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('POST', '/admin/invite', [
            'email' => 'invitee@example.com',
            'displayName' => 'Invitee',
        ], $this->tokenFor($owner));
        $this->assertNotSame(403, $response->getStatusCode());
    }

    // --- POST /admin/invite -------------------------------------------------

    public function testOwnerCanInviteMember(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('POST', '/admin/invite', [
            'email' => 'newmember@example.com',
            'displayName' => 'New Member',
        ], $this->tokenFor($owner));
        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('member', $this->decode($response)['user']['role']);
    }

    public function testAdminCanInviteMember(): void
    {
        [, $admin] = $this->seedTrio();
        $response = $this->request('POST', '/admin/invite', [
            'email' => 'newmember@example.com',
            'displayName' => 'New Member',
        ], $this->tokenFor($admin));
        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('member', $this->decode($response)['user']['role']);
    }

    public function testMemberCannotInvite(): void
    {
        [, , $member] = $this->seedTrio();
        $response = $this->request('POST', '/admin/invite', [
            'email' => 'newmember@example.com',
            'displayName' => 'New Member',
        ], $this->tokenFor($member));
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testInviteCreatesEnabledReportRecipient(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('POST', '/admin/invite', [
            'email' => 'newmember@example.com',
            'displayName' => 'New Member',
        ], $this->tokenFor($owner));
        $this->assertSame(201, $response->getStatusCode());

        $newUserId = $this->decode($response)['user']['id'];
        $stmt = $this->db->prepare('SELECT enabled FROM report_recipients WHERE user_id = :id');
        $stmt->execute(['id' => $newUserId]);
        $enabled = $stmt->fetchColumn();

        $this->assertNotFalse($enabled, 'invite should create a report_recipients row');
        $this->assertSame(1, (int) $enabled);
    }

    // --- PUT /admin/users/{id} (edit) ---------------------------------------

    public function testOwnerEditsMember(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $member['id'], ['displayName' => 'Renamed'], $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testOwnerEditsAdmin(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $admin['id'], ['displayName' => 'Renamed'], $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testOwnerEditsSelfBlocked(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $owner['id'], ['displayName' => 'Renamed'], $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
    }

    public function testAdminEditsMember(): void
    {
        [, $admin, $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $member['id'], ['displayName' => 'Renamed'], $this->tokenFor($admin));
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testAdminEditsAdminForbidden(): void
    {
        [, $admin] = $this->seedTrio();
        $other = $this->seedUser(['role' => 'admin', 'display_name' => 'Other Admin']);
        $response = $this->request('PUT', '/admin/users/' . $other['id'], ['displayName' => 'Renamed'], $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testAdminEditsOwnerForbidden(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $owner['id'], ['displayName' => 'Renamed'], $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testAdminEditsSelfBlocked(): void
    {
        [, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $admin['id'], ['displayName' => 'Renamed'], $this->tokenFor($admin));
        $this->assertSame(400, $response->getStatusCode());
    }

    // --- DELETE /admin/users/{id} -------------------------------------------

    public function testOwnerDeletesMember(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('DELETE', '/admin/users/' . $member['id'], null, $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testOwnerDeletesAdmin(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('DELETE', '/admin/users/' . $admin['id'], null, $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
        $this->assertNull($this->roleOf($admin['id']));
    }

    public function testOwnerDeletesSelfBlocked(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('DELETE', '/admin/users/' . $owner['id'], null, $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
    }

    public function testAdminDeletesMember(): void
    {
        [, $admin, $member] = $this->seedTrio();
        $response = $this->request('DELETE', '/admin/users/' . $member['id'], null, $this->tokenFor($admin));
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testAdminDeletesAdminForbidden(): void
    {
        [, $admin] = $this->seedTrio();
        $other = $this->seedUser(['role' => 'admin', 'display_name' => 'Other Admin']);
        $response = $this->request('DELETE', '/admin/users/' . $other['id'], null, $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testAdminDeletesOwnerForbidden(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('DELETE', '/admin/users/' . $owner['id'], null, $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testAdminDeletesSelfBlocked(): void
    {
        [, $admin] = $this->seedTrio();
        $response = $this->request('DELETE', '/admin/users/' . $admin['id'], null, $this->tokenFor($admin));
        $this->assertSame(400, $response->getStatusCode());
    }

    // --- PUT /admin/users/{id}/reset-password -------------------------------

    public function testOwnerResetsMemberPassword(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $member['id'] . '/reset-password', null, $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testOwnerResetsAdminPassword(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $admin['id'] . '/reset-password', null, $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testOwnerResetsSelfPasswordBlocked(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $owner['id'] . '/reset-password', null, $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
    }

    public function testAdminResetsMemberPassword(): void
    {
        [, $admin, $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $member['id'] . '/reset-password', null, $this->tokenFor($admin));
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testAdminResetsAdminPasswordForbidden(): void
    {
        [, $admin] = $this->seedTrio();
        $other = $this->seedUser(['role' => 'admin', 'display_name' => 'Other Admin']);
        $response = $this->request('PUT', '/admin/users/' . $other['id'] . '/reset-password', null, $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testAdminResetsOwnerPasswordForbidden(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $owner['id'] . '/reset-password', null, $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
    }

    // --- PUT /admin/users/{id}/promote --------------------------------------

    public function testOwnerPromotesMember(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $member['id'] . '/promote', null, $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('admin', $this->decode($response)['user']['role']);
        $this->assertSame('admin', $this->roleOf($member['id']));
    }

    public function testOwnerPromotesAdminRejected(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $admin['id'] . '/promote', null, $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('User is already an admin', $this->decode($response)['error']);
    }

    public function testOwnerPromotesSelfBlocked(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $owner['id'] . '/promote', null, $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('Cannot promote yourself', $this->decode($response)['error']);
    }

    public function testAdminCannotPromote(): void
    {
        [, $admin, $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $member['id'] . '/promote', null, $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('Only the workspace owner can promote users', $this->decode($response)['error']);
    }

    public function testMemberCannotPromote(): void
    {
        [, , $member] = $this->seedTrio();
        $target = $this->seedUser(['role' => 'member', 'display_name' => 'Target']);
        $response = $this->request('PUT', '/admin/users/' . $target['id'] . '/promote', null, $this->tokenFor($member));
        $this->assertSame(403, $response->getStatusCode());
    }

    // --- PUT /admin/users/{id}/demote ---------------------------------------

    public function testOwnerDemotesAdmin(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $admin['id'] . '/demote', null, $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('member', $this->decode($response)['user']['role']);
        $this->assertSame('member', $this->roleOf($admin['id']));
    }

    public function testOwnerDemotesMemberRejected(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $member['id'] . '/demote', null, $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('User is not an admin', $this->decode($response)['error']);
    }

    public function testOwnerDemotesSelfBlocked(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $owner['id'] . '/demote', null, $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('Cannot demote yourself', $this->decode($response)['error']);
    }

    public function testAdminCannotDemote(): void
    {
        [, $admin] = $this->seedTrio();
        $other = $this->seedUser(['role' => 'admin', 'display_name' => 'Other Admin']);
        $response = $this->request('PUT', '/admin/users/' . $other['id'] . '/demote', null, $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('Only the workspace owner can demote users', $this->decode($response)['error']);
    }

    public function testMemberCannotDemote(): void
    {
        [, $admin, $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/users/' . $admin['id'] . '/demote', null, $this->tokenFor($member));
        $this->assertSame(403, $response->getStatusCode());
    }

    // --- PUT /admin/transfer ------------------------------------------------

    public function testOwnerTransfersToAdmin(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/transfer', ['targetUserId' => $admin['id']], $this->tokenFor($owner));
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('owner', $this->roleOf($admin['id']));
        $this->assertSame('admin', $this->roleOf($owner['id']));
    }

    public function testOwnerTransfersToMemberRejected(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/transfer', ['targetUserId' => $member['id']], $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('Target must be an admin to receive ownership. Promote them first.', $this->decode($response)['error']);
    }

    public function testOwnerTransfersToSelfBlocked(): void
    {
        [$owner] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/transfer', ['targetUserId' => $owner['id']], $this->tokenFor($owner));
        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('Cannot transfer ownership to yourself', $this->decode($response)['error']);
    }

    public function testAdminCannotTransfer(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/transfer', ['targetUserId' => $owner['id']], $this->tokenFor($admin));
        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('Only the workspace owner can transfer ownership', $this->decode($response)['error']);
    }

    public function testMemberCannotTransfer(): void
    {
        [, $admin, $member] = $this->seedTrio();
        $response = $this->request('PUT', '/admin/transfer', ['targetUserId' => $admin['id']], $this->tokenFor($member));
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testTransferPreservesOwnerInvariant(): void
    {
        [$owner, $admin] = $this->seedTrio();
        $this->request('PUT', '/admin/transfer', ['targetUserId' => $admin['id']], $this->tokenFor($owner));

        $stmt = $this->db->query("SELECT COUNT(*) AS c FROM users WHERE role = 'owner'");
        $this->assertSame(1, (int) $stmt->fetch()['c'], 'exactly one owner must remain after transfer');
    }

    // --- GET /auth/users ----------------------------------------------------

    public function testOwnerSeesEmailAndCreatedAt(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('GET', '/auth/users', null, $this->tokenFor($owner));
        $entry = $this->userEntry($this->decode($response)['users'], $member['id']);
        $this->assertArrayHasKey('email', $entry);
        $this->assertArrayHasKey('createdAt', $entry);
    }

    public function testAdminSeesEmailAndCreatedAt(): void
    {
        [, $admin, $member] = $this->seedTrio();
        $response = $this->request('GET', '/auth/users', null, $this->tokenFor($admin));
        $entry = $this->userEntry($this->decode($response)['users'], $member['id']);
        $this->assertArrayHasKey('email', $entry);
        $this->assertArrayHasKey('createdAt', $entry);
    }

    public function testMemberDoesNotSeeEmailOrCreatedAt(): void
    {
        [$owner, , $member] = $this->seedTrio();
        $response = $this->request('GET', '/auth/users', null, $this->tokenFor($member));
        $entry = $this->userEntry($this->decode($response)['users'], $owner['id']);
        $this->assertArrayNotHasKey('email', $entry);
        $this->assertArrayNotHasKey('createdAt', $entry);
    }

    /** Find a user entry by id in a /auth/users response list. */
    private function userEntry(array $users, string $id): array
    {
        foreach ($users as $u) {
            if ($u['id'] === $id) {
                return $u;
            }
        }
        $this->fail('user ' . $id . ' not present in /auth/users response');
    }

    // --- POST /auth/signup --------------------------------------------------

    public function testFirstSignupBecomesOwner(): void
    {
        // setUp truncates all tables, so the users table is empty here.
        $response = $this->request('POST', '/auth/signup', [
            'email' => 'first@example.com',
            'password' => 'first-user-password',
            'displayName' => 'First User',
        ]);
        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('owner', $this->decode($response)['user']['role']);

        $stmt = $this->db->prepare('SELECT role FROM users WHERE email = :email');
        $stmt->execute(['email' => 'first@example.com']);
        $this->assertSame('owner', $stmt->fetch()['role']);
    }
}
