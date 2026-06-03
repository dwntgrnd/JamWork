<?php

namespace Tests;

use PHPUnit\Framework\TestCase;
use JamWork\Lib\Database;
use JamWork\Lib\DatabaseUnavailableException;

/**
 * The morning incident: when MySQL is down, an authed request blew up with a raw
 * PDOException -> HTTP 500. getInstance() should translate a connection failure
 * into a typed DatabaseUnavailableException so the app can answer with a clean 503.
 */
final class DatabaseTest extends TestCase
{
    /** @var array<string,string> */
    private array $savedEnv = [];

    protected function setUp(): void
    {
        foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $k) {
            $this->savedEnv[$k] = $_ENV[$k] ?? '';
        }
        $this->resetSingleton();

        // Point at a port nothing is listening on -> immediate connection refused.
        $_ENV['DB_HOST'] = '127.0.0.1';
        $_ENV['DB_PORT'] = '59999';
        $_ENV['DB_NAME'] = 'no_such_db';
        $_ENV['DB_USER'] = 'nobody';
        $_ENV['DB_PASS'] = 'nopass';
    }

    protected function tearDown(): void
    {
        foreach ($this->savedEnv as $k => $v) {
            $_ENV[$k] = $v;
        }
        $this->resetSingleton();
    }

    private function resetSingleton(): void
    {
        $prop = new \ReflectionProperty(Database::class, 'instance');
        $prop->setValue(null, null);
    }

    public function testConnectionFailureThrowsDatabaseUnavailable(): void
    {
        $this->expectException(DatabaseUnavailableException::class);
        Database::getInstance();
    }
}
