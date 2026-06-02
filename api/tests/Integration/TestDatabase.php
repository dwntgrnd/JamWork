<?php

namespace Tests\Integration;

use JamWork\Lib\Database;
use PDO;

/**
 * Owns the test schema lifecycle for the integration harness.
 *
 * migrate() runs once per phpunit process (from tests/bootstrap.php): it
 * ensures the configured test database exists, drops every table, and replays
 * the migration files in order — giving a clean, real MySQL schema identical to
 * production. truncateAll() runs between tests for fast row-level isolation.
 *
 * DB connection details come from $_ENV (set in tests/bootstrap.php), so the
 * same code points at the local Docker MySQL or the CI service container.
 */
final class TestDatabase
{
    private static bool $migrated = false;

    public static function migrate(): void
    {
        if (self::$migrated) {
            return;
        }

        $dbName = $_ENV['DB_NAME'];
        self::ensureDatabaseExists($dbName);

        $pdo = Database::getInstance();
        self::dropAllTables($pdo, $dbName);

        $migrationsDir = __DIR__ . '/../../migrations';
        $files = glob($migrationsDir . '/*.sql');
        sort($files);
        foreach ($files as $file) {
            $sql = file_get_contents($file);
            if ($sql !== false && trim($sql) !== '') {
                $pdo->exec($sql);
            }
        }

        self::$migrated = true;
    }

    /**
     * Delete all rows from every table for between-test isolation, with foreign
     * key checks disabled so truncation order doesn't matter.
     */
    public static function truncateAll(): void
    {
        $pdo = Database::getInstance();
        $tables = self::tableNames($pdo, $_ENV['DB_NAME']);

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tables as $table) {
            $pdo->exec("TRUNCATE TABLE `{$table}`");
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    private static function ensureDatabaseExists(string $dbName): void
    {
        // Connect to the server without selecting a database. The test user is
        // root locally; in CI the database is pre-created by the service, so a
        // privilege error on CREATE is harmless and ignored.
        $dsn = "mysql:host={$_ENV['DB_HOST']};port=" . ($_ENV['DB_PORT'] ?? '3306') . ';charset=utf8mb4';
        try {
            $server = new PDO($dsn, $_ENV['DB_USER'], $_ENV['DB_PASS'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            $server->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        } catch (\PDOException $e) {
            // Database already exists and the user lacks CREATE — fine.
        }
    }

    private static function dropAllTables(PDO $pdo, string $dbName): void
    {
        $tables = self::tableNames($pdo, $dbName);
        if (empty($tables)) {
            return;
        }

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tables as $table) {
            $pdo->exec("DROP TABLE IF EXISTS `{$table}`");
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    /** @return string[] */
    private static function tableNames(PDO $pdo, string $dbName): array
    {
        $stmt = $pdo->prepare(
            "SELECT table_name FROM information_schema.tables
             WHERE table_schema = :db AND table_type = 'BASE TABLE'"
        );
        $stmt->execute(['db' => $dbName]);
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }
}
