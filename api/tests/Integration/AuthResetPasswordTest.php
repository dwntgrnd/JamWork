<?php

namespace Tests\Integration;

/**
 * The forced password-reset flow bumps token_version (revoking other sessions).
 * It must also re-issue the auth cookie for THIS session — like change-password —
 * so the user who just reset their password stays logged in instead of being
 * bounced to the login screen.
 */
final class AuthResetPasswordTest extends IntegrationTestCase
{
    public function testForcedResetReissuesCookieAndKeepsSessionValid(): void
    {
        $user = $this->seedUser(['role' => 'member']);
        $this->db->prepare('UPDATE users SET must_reset_password = 1 WHERE id = :id')
            ->execute(['id' => $user['id']]);

        $oldToken = $this->tokenFor($user, 0);

        $response = $this->request(
            'PUT',
            '/auth/reset-password',
            ['newPassword' => 'brand-new-pass-123'],
            $oldToken
        );
        $this->assertSame(200, $response->getStatusCode());

        // Must re-issue the auth cookie with the bumped token_version.
        $setCookie = $response->getHeaderLine('Set-Cookie');
        $this->assertMatchesRegularExpression(
            '/token=[^;]+/',
            $setCookie,
            'reset-password must re-issue the auth cookie'
        );
        preg_match('/token=([^;]+)/', $setCookie, $m);
        $newToken = $m[1] ?? '';

        // The re-issued cookie keeps the current session authenticated.
        $me = $this->request('GET', '/auth/me', null, $newToken);
        $this->assertSame(200, $me->getStatusCode(), 're-issued cookie should still authenticate');

        // The pre-reset token (old tv) is revoked.
        $meOld = $this->request('GET', '/auth/me', null, $oldToken);
        $this->assertSame(401, $meOld->getStatusCode(), 'pre-reset session must be revoked');
    }
}
