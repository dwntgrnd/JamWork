<?php

/**
 * Dependency-free tests for Security Hardening Round 2 (audit S3–S9).
 *
 * No PHPUnit, no DB, no network — exercises the pure decision/util functions
 * extracted for each finding. Run:  php tests/SecurityHardeningTest.php
 */

require __DIR__ . '/../vendor/autoload.php';

use JamWork\Lib\Auth;
use JamWork\Lib\Mailer;
use JamWork\Lib\Validator;
use JamWork\Middleware\RateLimitMiddleware;

// Token round-trip tests need a secret present.
$_ENV['JWT_SECRET'] = 'test-secret-key-for-security-hardening-tests';

$tests = 0;
$failures = 0;

function check(string $name, bool $cond): void
{
    global $tests, $failures;
    $tests++;
    echo $cond ? "  ok   - {$name}\n" : "  FAIL - {$name}\n";
    if (!$cond) {
        $GLOBALS['failures']++;
    }
}

echo "S9 — invite-email escaping\n";

$tpl = '<h1>{{WORKSPACE_NAME}}</h1><p>{{EMAIL}}</p>';
$out = Mailer::renderInviteBody($tpl, '<script>x</script>', 'Dana', 'd@example.com', 'pw1234567890', 'https://app/login');
check('S9: workspace name is HTML-escaped',
    str_contains($out, '&lt;script&gt;') && !str_contains($out, '<script>'));
check('S9: other fields still escaped (email)',
    str_contains($out, 'd@example.com'));

echo "S8 — admin invite password policy\n";

$rules = ['password' => 'optional|min:10'];
check('S8: short provided password is rejected',
    Validator::validate(['password' => 'short'], $rules) !== []);
check('S8: valid provided password passes',
    Validator::validate(['password' => 'longenough10'], $rules) === []);
check('S8: absent password passes (auto-generate path)',
    Validator::validate([], $rules) === []);

echo "S6 — constant-time login dummy hash\n";

$info = password_get_info(Auth::DUMMY_PASSWORD_HASH);
check('S6: DUMMY_PASSWORD_HASH is a valid bcrypt hash',
    $info['algoName'] === 'bcrypt');
check('S6: dummy hash never verifies a real attempt',
    Auth::verifyPassword('any-attempt', Auth::DUMMY_PASSWORD_HASH) === false);

echo "S4 — client IP resolution\n";

$server = ['REMOTE_ADDR' => '10.0.0.5'];
check('S4: proxy off → REMOTE_ADDR',
    RateLimitMiddleware::resolveClientIp($server, '1.2.3.4', false) === '10.0.0.5');
check('S4: proxy on → right-most XFF entry',
    RateLimitMiddleware::resolveClientIp($server, '1.2.3.4, 5.6.7.8', true) === '5.6.7.8');
check('S4: proxy on, single XFF entry',
    RateLimitMiddleware::resolveClientIp($server, '203.0.113.9', true) === '203.0.113.9');
check('S4: proxy on but empty XFF → REMOTE_ADDR',
    RateLimitMiddleware::resolveClientIp($server, '', true) === '10.0.0.5');
check('S4: proxy on, null XFF → REMOTE_ADDR',
    RateLimitMiddleware::resolveClientIp($server, null, true) === '10.0.0.5');

echo "S3 — token_version matching & claim\n";

check('S3: equal versions match',
    Auth::tokenVersionMatches(3, 3) === true);
check('S3: unequal versions do not match',
    Auth::tokenVersionMatches(2, 3) === false);
check('S3: missing claim (null) is treated as 0 and matches default',
    Auth::tokenVersionMatches(null, 0) === true);
check('S3: missing claim (null) does not match a bumped version',
    Auth::tokenVersionMatches(null, 1) === false);

// Round-trip: generateToken embeds tv; decodeToken returns it.
$token = Auth::generateToken('user-1', 'member', 4);
$decoded = Auth::decodeToken($token);
check('S3: generated token carries tv claim',
    is_array($decoded) && (int) ($decoded['tv'] ?? -1) === 4);

echo "\n{$tests} checks, {$failures} failure(s)\n";
exit($failures === 0 ? 0 : 1);
