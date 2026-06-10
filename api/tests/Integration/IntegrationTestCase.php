<?php

namespace Tests\Integration;

use JamWork\Bootstrap;
use JamWork\Lib\Auth;
use JamWork\Lib\Database;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Ramsey\Uuid\Uuid;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Base class for HTTP-level characterization tests. Boots the real Slim app
 * (via Bootstrap::createApp) against a real MySQL test schema and dispatches
 * PSR-7 requests through the full middleware stack — so a test exercises the
 * same code path a browser hits, independent of how the routes are internally
 * structured. That is exactly what lets us refactor the routes underneath.
 */
abstract class IntegrationTestCase extends TestCase
{
    protected App $app;
    protected PDO $db;

    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();
        TestDatabase::migrate();
    }

    protected function setUp(): void
    {
        TestDatabase::truncateAll();
        $this->clearRateLimitStore();
        $this->db = Database::getInstance();
        $this->app = Bootstrap::createApp();
    }

    // --- Request dispatch ---------------------------------------------------

    /**
     * Dispatch a request through the app. $path is relative to the /api base
     * path (e.g. '/tasks'). A non-null $token is sent as the auth cookie.
     * $headers are added verbatim (e.g. ['Authorization' => 'Bearer ...'] for
     * the shared-secret cron endpoint, which has no user session).
     */
    protected function request(
        string $method,
        string $path,
        ?array $body = null,
        ?string $token = null,
        array $headers = []
    ): ResponseInterface {
        $request = (new ServerRequestFactory())
            ->createServerRequest($method, '/api' . $path, ['REMOTE_ADDR' => '127.0.0.1']);

        if ($token !== null) {
            $request = $request->withCookieParams(['token' => $token]);
        }

        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        if ($body !== null) {
            $request->getBody()->write(json_encode($body));
            $request->getBody()->rewind();
            $request = $request->withHeader('Content-Type', 'application/json');
        }

        return $this->app->handle($request);
    }

    /** Decode a JSON response body to an associative array. */
    protected function decode(ResponseInterface $response): mixed
    {
        return json_decode((string) $response->getBody(), true);
    }

    // --- Seeding ------------------------------------------------------------

    /** Insert a user; returns ['id','email','display_name','role']. */
    protected function seedUser(array $overrides = []): array
    {
        $id = $overrides['id'] ?? Uuid::uuid4()->toString();
        $email = $overrides['email'] ?? ('user-' . substr($id, 0, 8) . '@example.com');
        $row = [
            'id' => $id,
            'email' => $email,
            'password_hash' => $overrides['password_hash'] ?? Auth::DUMMY_PASSWORD_HASH,
            'display_name' => $overrides['display_name'] ?? 'Test User',
            'role' => $overrides['role'] ?? 'member',
        ];
        $stmt = $this->db->prepare(
            'INSERT INTO users (id, email, password_hash, display_name, role)
             VALUES (:id, :email, :password_hash, :display_name, :role)'
        );
        $stmt->execute($row);
        return ['id' => $id, 'email' => $email, 'display_name' => $row['display_name'], 'role' => $row['role']];
    }

    /** Insert a project owned by $createdById; returns its id. */
    protected function seedProject(string $createdById, array $overrides = []): string
    {
        $id = $overrides['id'] ?? Uuid::uuid4()->toString();
        $stmt = $this->db->prepare(
            'INSERT INTO projects (id, name, description, created_by_id)
             VALUES (:id, :name, :description, :created_by_id)'
        );
        $stmt->execute([
            'id' => $id,
            'name' => $overrides['name'] ?? 'Test Project',
            'description' => $overrides['description'] ?? null,
            'created_by_id' => $createdById,
        ]);
        return $id;
    }

    /** Insert a task in $projectId; returns its id. */
    protected function seedTask(string $projectId, string $createdById, array $overrides = []): string
    {
        $id = $overrides['id'] ?? Uuid::uuid4()->toString();
        $cols = array_merge([
            'id' => $id,
            'title' => 'Test Task',
            'status' => 'todo',
            'priority' => 'medium',
            'sort_order' => 0,
            'project_id' => $projectId,
            'created_by_id' => $createdById,
        ], $overrides);
        $cols['id'] = $id;
        $cols['project_id'] = $projectId;
        $cols['created_by_id'] = $createdById;

        $fields = array_keys($cols);
        $placeholders = array_map(fn($f) => ':' . $f, $fields);
        $sql = 'INSERT INTO tasks (' . implode(', ', $fields) . ') VALUES (' . implode(', ', $placeholders) . ')';
        $this->db->prepare($sql)->execute($cols);
        return $id;
    }

    /** Insert a sprint created by $createdById; returns its id. */
    protected function seedSprint(string $createdById, array $overrides = []): string
    {
        $id = $overrides['id'] ?? Uuid::uuid4()->toString();
        $stmt = $this->db->prepare(
            'INSERT INTO sprints (id, name, description, start_date, end_date, status, project_id, created_by_id)
             VALUES (:id, :name, :description, :start_date, :end_date, :status, :project_id, :created_by_id)'
        );
        $stmt->execute([
            'id' => $id,
            'name' => $overrides['name'] ?? 'Test Sprint',
            'description' => $overrides['description'] ?? null,
            'start_date' => $overrides['start_date'] ?? '2026-01-01 00:00:00',
            'end_date' => $overrides['end_date'] ?? '2026-01-14 00:00:00',
            'status' => $overrides['status'] ?? 'active',
            'project_id' => $overrides['project_id'] ?? null,
            'created_by_id' => $createdById,
        ]);
        return $id;
    }

    /** Assign $userId to $taskId. */
    protected function assignTask(string $taskId, string $userId): void
    {
        $this->db->prepare(
            'INSERT INTO task_assignees (id, task_id, user_id) VALUES (:id, :task_id, :user_id)'
        )->execute(['id' => Uuid::uuid4()->toString(), 'task_id' => $taskId, 'user_id' => $userId]);
    }

    // --- Auth ---------------------------------------------------------------

    /** Mint a valid auth-cookie token for a seeded user. */
    protected function tokenFor(array $user, int $tokenVersion = 0): string
    {
        return Auth::generateToken($user['id'], $user['role'], $tokenVersion);
    }

    // --- Helpers ------------------------------------------------------------

    private function clearRateLimitStore(): void
    {
        $dir = sys_get_temp_dir() . '/jamwork_ratelimit';
        foreach (glob($dir . '/*.json') ?: [] as $file) {
            @unlink($file);
        }
    }
}
