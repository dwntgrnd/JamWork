<?php

namespace Tests;

use PHPUnit\Framework\TestCase;
use JamWork\Lib\Auth;
use JamWork\Lib\Mailer;
use JamWork\Lib\Validator;
use JamWork\Middleware\RateLimitMiddleware;

/**
 * Pure-logic tests for Security Hardening Round 2 (audit S3–S9).
 * No DB, no network — exercises the extracted decision/util functions.
 */
final class SecurityHardeningTest extends TestCase
{
    protected function setUp(): void
    {
        // Token round-trip tests need a secret present.
        $_ENV['JWT_SECRET'] = 'test-secret-key-for-security-hardening-tests';
    }

    protected function tearDown(): void
    {
        unset($_ENV['JWT_SECRET']);
    }

    public function testInviteEmailEscaping(): void // S9
    {
        $tpl = '<h1>{{WORKSPACE_NAME}}</h1><p>{{EMAIL}}</p>';
        $out = Mailer::renderInviteBody($tpl, '<script>x</script>', 'Dana', 'd@example.com', 'pw1234567890', 'https://app/login');

        $this->assertStringContainsString('&lt;script&gt;', $out);
        $this->assertStringNotContainsString('<script>', $out);
        $this->assertStringContainsString('d@example.com', $out);
    }

    public function testAdminInvitePasswordPolicy(): void // S8
    {
        $rules = ['password' => 'optional|min:10'];

        $this->assertNotEmpty(Validator::validate(['password' => 'short'], $rules));
        $this->assertSame([], Validator::validate(['password' => 'longenough10'], $rules));
        $this->assertSame([], Validator::validate([], $rules));
    }

    public function testConstantTimeLoginDummyHash(): void // S6
    {
        $info = password_get_info(Auth::DUMMY_PASSWORD_HASH);
        $this->assertSame('bcrypt', $info['algoName']);
        $this->assertFalse(Auth::verifyPassword('any-attempt', Auth::DUMMY_PASSWORD_HASH));
    }

    public function testClientIpResolution(): void // S4
    {
        $server = ['REMOTE_ADDR' => '10.0.0.5'];

        $this->assertSame('10.0.0.5', RateLimitMiddleware::resolveClientIp($server, '1.2.3.4', false));
        $this->assertSame('5.6.7.8', RateLimitMiddleware::resolveClientIp($server, '1.2.3.4, 5.6.7.8', true));
        $this->assertSame('203.0.113.9', RateLimitMiddleware::resolveClientIp($server, '203.0.113.9', true));
        $this->assertSame('10.0.0.5', RateLimitMiddleware::resolveClientIp($server, '', true));
        $this->assertSame('10.0.0.5', RateLimitMiddleware::resolveClientIp($server, null, true));
    }

    public function testTokenVersionMatchingAndClaim(): void // S3
    {
        $this->assertTrue(Auth::tokenVersionMatches(3, 3));
        $this->assertFalse(Auth::tokenVersionMatches(2, 3));
        $this->assertTrue(Auth::tokenVersionMatches(null, 0));
        $this->assertFalse(Auth::tokenVersionMatches(null, 1));

        $token = Auth::generateToken('user-1', 'member', 4);
        $decoded = Auth::decodeToken($token);
        $this->assertIsArray($decoded);
        $this->assertSame(4, (int) ($decoded['tv'] ?? -1));
    }
}
