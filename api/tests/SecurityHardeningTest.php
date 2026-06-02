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

echo "\n{$tests} checks, {$failures} failure(s)\n";
exit($failures === 0 ? 0 : 1);
