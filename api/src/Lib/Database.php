<?php

namespace JamWork\Lib;

use PDO;

class Database
{
    private static ?PDO $instance = null;

    private function __construct() {}

    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            $host = $_ENV['DB_HOST'];
            $port = $_ENV['DB_PORT'] ?? '3306';
            $name = $_ENV['DB_NAME'];
            $user = $_ENV['DB_USER'];
            $pass = $_ENV['DB_PASS'];

            $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

            try {
                self::$instance = new PDO($dsn, $user, $pass, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    // Pin the session to UTC so MySQL-written times (NOW(),
                    // completed_at) and PHP-side time()/strtotime() comparisons
                    // (Done window, overdue) share one clock regardless of host TZ.
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
                ]);
            } catch (\PDOException $e) {
                // DB unreachable (e.g. MySQL down) — surface as a typed, transient
                // failure so the error handler can answer 503 instead of a raw 500.
                throw new DatabaseUnavailableException('Database unavailable', 0, $e);
            }
        }

        return self::$instance;
    }
}
