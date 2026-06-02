<?php

/**
 * PHPUnit bootstrap. Loads the autoloader, sets the test environment, and
 * builds the MySQL test schema once per process.
 *
 * Connection values come from real environment variables when present (so CI
 * can point at its MySQL service), falling back to the local Docker MySQL.
 */

require __DIR__ . '/../vendor/autoload.php';

date_default_timezone_set('UTC');

$env = static function (string $key, string $default): string {
    $value = getenv($key);
    return ($value === false || $value === '') ? $default : $value;
};

$_ENV['DB_HOST']    = $env('DB_HOST', '127.0.0.1');
$_ENV['DB_PORT']    = $env('DB_PORT', '3306');
$_ENV['DB_NAME']    = $env('DB_NAME', 'jamwork_test');
$_ENV['DB_USER']    = $env('DB_USER', 'root');
$_ENV['DB_PASS']    = $env('DB_PASS', 'jamwork_root');
$_ENV['JWT_SECRET'] = $env('JWT_SECRET', 'integration-test-secret-key-0123456789abcd');
$_ENV['JWT_EXPIRY'] = $env('JWT_EXPIRY', '30d');
$_ENV['APP_ENV']    = $env('APP_ENV', 'development');
$_ENV['APP_URL']    = $env('APP_URL', 'http://localhost:5173');

// The test schema is built lazily by IntegrationTestCase::setUpBeforeClass(),
// so the pure-logic unit tests don't require a running MySQL.
