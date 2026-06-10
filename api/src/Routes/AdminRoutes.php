<?php

namespace JamWork\Routes;

use JamWork\Lib\Auth;
use JamWork\Lib\Database;
use JamWork\Lib\Mailer;
use JamWork\Lib\Validator;
use JamWork\Middleware\AdminMiddleware;
use JamWork\Middleware\AuthMiddleware;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Ramsey\Uuid\Uuid;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class AdminRoutes
{

    public static function register(App $app): void
    {
        $app->group('/admin', function (RouteCollectorProxy $group) {

            // POST /admin/invite
            $group->post('/invite', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'email' => 'required|email',
                    'displayName' => 'required|min:1|max:100',
                    'password' => 'optional|min:10',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();
                $email = strtolower(trim($data['email']));

                // Check for duplicate
                $stmt = $db->prepare('SELECT id FROM users WHERE email = :email');
                $stmt->execute(['email' => $email]);
                if ($stmt->fetch()) {
                    $response->getBody()->write(json_encode([
                        'error' => 'User with this email already exists',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(409);
                }

                // Generate temp password or use provided
                $temporaryPassword = $data['password'] ?? bin2hex(random_bytes(8));
                $passwordHash = Auth::hashPassword($temporaryPassword);
                $displayName = trim($data['displayName']);
                $userId = Uuid::uuid4()->toString();

                $stmt = $db->prepare(
                    'INSERT INTO users (id, email, password_hash, display_name, role, must_reset_password)
                     VALUES (:id, :email, :password_hash, :display_name, :role, :must_reset_password)'
                );
                $stmt->execute([
                    'id' => $userId,
                    'email' => $email,
                    'password_hash' => $passwordHash,
                    'display_name' => $displayName,
                    'role' => 'member',
                    'must_reset_password' => 1,
                ]);

                // New members default to enabled report recipients (Decision #103).
                $stmt = $db->prepare(
                    'INSERT INTO report_recipients (id, user_id, enabled) VALUES (:id, :user_id, 1)'
                );
                $stmt->execute(['id' => Uuid::uuid4()->toString(), 'user_id' => $userId]);

                // Attempt to send invite email
                $emailSent = false;
                if (Mailer::isConfigured()) {
                    $mailer = new Mailer();

                    // Get workspace name for email
                    $stmt = $db->prepare('SELECT `value` FROM `workspace_settings` WHERE `key` = :key');
                    $stmt->execute(['key' => 'workspace_name']);
                    $wsRow = $stmt->fetch();
                    $workspaceName = $wsRow ? $wsRow['value'] : 'TeamTask';

                    $loginUrl = ($_ENV['APP_URL'] ?? '') . '/login';

                    $result = $mailer->sendInviteEmail(
                        $email,
                        $displayName,
                        $temporaryPassword,
                        $workspaceName,
                        $loginUrl
                    );
                    $emailSent = $result['sent'];
                }

                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $userId,
                        'email' => $email,
                        'displayName' => $displayName,
                        'role' => 'member',
                    ],
                    'temporaryPassword' => $temporaryPassword,
                    'emailSent' => $emailSent,
                    'message' => 'Invitation sent',
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(201);
            });

            // PUT /admin/transfer — owner transfers ownership to an admin.
            // The transferring owner is demoted to admin (Decision #106), NOT member.
            $group->put('/transfer', function (Request $request, Response $response) {
                $callerRole = $request->getAttribute('role');

                if ($callerRole !== 'owner') {
                    $response->getBody()->write(json_encode([
                        'error' => 'Only the workspace owner can transfer ownership',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(403);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'targetUserId' => 'required|uuid',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $adminId = $request->getAttribute('userId');
                $targetUserId = $data['targetUserId'];

                if ($targetUserId === $adminId) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Cannot transfer ownership to yourself',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, email, display_name, role FROM users WHERE id = :id');
                $stmt->execute(['id' => $targetUserId]);
                $targetUser = $stmt->fetch();

                if (!$targetUser) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Target user not found',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                if ($targetUser['role'] !== 'admin') {
                    $response->getBody()->write(json_encode([
                        'error' => 'Target must be an admin to receive ownership. Promote them first.',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                try {
                    $db->beginTransaction();

                    // Demote the current owner to admin (NOT member) — they retain admin access.
                    $stmt = $db->prepare('UPDATE users SET role = :role WHERE id = :id');
                    $stmt->execute(['role' => 'admin', 'id' => $adminId]);

                    $stmt = $db->prepare('UPDATE users SET role = :role WHERE id = :id');
                    $stmt->execute(['role' => 'owner', 'id' => $targetUserId]);

                    $db->commit();
                } catch (\Exception $e) {
                    $db->rollBack();
                    error_log('Transfer error: ' . $e->getMessage());
                    $response->getBody()->write(json_encode([
                        'error' => 'Failed to transfer ownership',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(500);
                }

                // The caller's JWT now carries a stale role. Signal the client to
                // re-fetch /auth/me; we do not re-issue the cookie here (CC31b).
                $response->getBody()->write(json_encode([
                    'message' => 'Ownership transferred',
                    'reauthRequired' => true,
                    'newOwner' => [
                        'id' => $targetUser['id'],
                        'email' => $targetUser['email'],
                        'displayName' => $targetUser['display_name'],
                    ],
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // PUT /admin/users/{id}/promote — owner only; member → admin.
            $group->put('/users/{id}/promote', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                if ($request->getAttribute('role') !== 'owner') {
                    $response->getBody()->write(json_encode([
                        'error' => 'Only the workspace owner can promote users',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(403);
                }

                if ($id === $request->getAttribute('userId')) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Cannot promote yourself',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, role FROM users WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $targetUser = $stmt->fetch();

                if (!$targetUser) {
                    $response->getBody()->write(json_encode([
                        'error' => 'User not found',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                if ($targetUser['role'] !== 'member') {
                    $message = $targetUser['role'] === 'owner'
                        ? 'Cannot promote the owner'
                        : 'User is already an admin';
                    $response->getBody()->write(json_encode(['error' => $message]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $stmt = $db->prepare('UPDATE users SET role = :role WHERE id = :id');
                $stmt->execute(['role' => 'admin', 'id' => $id]);

                $stmt = $db->prepare('SELECT id, email, display_name, role FROM users WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $updated = $stmt->fetch();

                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $updated['id'],
                        'email' => $updated['email'],
                        'displayName' => $updated['display_name'],
                        'role' => $updated['role'],
                    ],
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // PUT /admin/users/{id}/demote — owner only; admin → member.
            $group->put('/users/{id}/demote', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                if ($request->getAttribute('role') !== 'owner') {
                    $response->getBody()->write(json_encode([
                        'error' => 'Only the workspace owner can demote users',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(403);
                }

                if ($id === $request->getAttribute('userId')) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Cannot demote yourself',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, role FROM users WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $targetUser = $stmt->fetch();

                if (!$targetUser) {
                    $response->getBody()->write(json_encode([
                        'error' => 'User not found',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                if ($targetUser['role'] !== 'admin') {
                    $message = $targetUser['role'] === 'owner'
                        ? 'Cannot demote the owner'
                        : 'User is not an admin';
                    $response->getBody()->write(json_encode(['error' => $message]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $stmt = $db->prepare('UPDATE users SET role = :role WHERE id = :id');
                $stmt->execute(['role' => 'member', 'id' => $id]);

                $stmt = $db->prepare('SELECT id, email, display_name, role FROM users WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $updated = $stmt->fetch();

                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $updated['id'],
                        'email' => $updated['email'],
                        'displayName' => $updated['display_name'],
                        'role' => $updated['role'],
                    ],
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // PUT /admin/users/{id}/reset-password
            $group->put('/users/{id}/reset-password', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $adminId = $request->getAttribute('userId');

                if ($id === $adminId) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Cannot reset your own password here. Use the settings page.',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, role FROM users WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $targetUser = $stmt->fetch();
                if (!$targetUser) {
                    $response->getBody()->write(json_encode([
                        'error' => 'User not found',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                if ($denied = self::denyIfTargetForbidden($request->getAttribute('role'), $targetUser['role'], $response)) {
                    return $denied;
                }

                $temporaryPassword = bin2hex(random_bytes(8));
                $passwordHash = Auth::hashPassword($temporaryPassword);

                $stmt = $db->prepare(
                    'UPDATE users SET password_hash = :hash, must_reset_password = 1, token_version = token_version + 1 WHERE id = :id'
                );
                $stmt->execute(['hash' => $passwordHash, 'id' => $id]);

                $response->getBody()->write(json_encode([
                    'temporaryPassword' => $temporaryPassword,
                    'message' => 'Password reset successfully',
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // PUT /admin/users/{id}
            $group->put('/users/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $adminId = $request->getAttribute('userId');

                if ($id === $adminId) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Cannot edit your own profile here. Use the settings page.',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'email' => 'optional|email',
                    'displayName' => 'optional|min:1|max:100',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT * FROM users WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $targetUser = $stmt->fetch();

                if (!$targetUser) {
                    $response->getBody()->write(json_encode([
                        'error' => 'User not found',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                if ($denied = self::denyIfTargetForbidden($request->getAttribute('role'), $targetUser['role'], $response)) {
                    return $denied;
                }

                $updates = [];
                $params = ['id' => $id];

                if (isset($data['email'])) {
                    $emailLower = strtolower(trim($data['email']));
                    if ($emailLower !== $targetUser['email']) {
                        $stmt = $db->prepare('SELECT id FROM users WHERE email = :email');
                        $stmt->execute(['email' => $emailLower]);
                        if ($stmt->fetch()) {
                            $response->getBody()->write(json_encode([
                                'error' => 'A user with this email already exists',
                            ]));
                            return $response
                                ->withHeader('Content-Type', 'application/json')
                                ->withStatus(409);
                        }
                        $updates[] = 'email = :email';
                        $params['email'] = $emailLower;
                    }
                }

                if (isset($data['displayName'])) {
                    $updates[] = 'display_name = :display_name';
                    $params['display_name'] = trim($data['displayName']);
                }

                if (!empty($updates)) {
                    $sql = 'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id';
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);
                }

                // Fetch updated user
                $stmt = $db->prepare('SELECT id, email, display_name, role FROM users WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $updated = $stmt->fetch();

                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $updated['id'],
                        'email' => $updated['email'],
                        'displayName' => $updated['display_name'],
                        'role' => $updated['role'],
                    ],
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // DELETE /admin/users/{id}
            $group->delete('/users/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $adminId = $request->getAttribute('userId');

                if ($id === $adminId) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Cannot delete yourself',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, role FROM users WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $targetUser = $stmt->fetch();

                if (!$targetUser) {
                    $response->getBody()->write(json_encode([
                        'error' => 'User not found',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                if ($denied = self::denyIfTargetForbidden($request->getAttribute('role'), $targetUser['role'], $response)) {
                    return $denied;
                }

                try {
                    $db->beginTransaction();

                    // Reassign owned entities to the admin
                    $tables = ['projects', 'tasks', 'sprints', 'milestones', 'labels', 'task_links'];
                    foreach ($tables as $table) {
                        $stmt = $db->prepare(
                            "UPDATE `{$table}` SET `created_by_id` = :adminId WHERE `created_by_id` = :userId"
                        );
                        $stmt->execute(['adminId' => $adminId, 'userId' => $id]);
                    }

                    // Remove task assignments
                    $stmt = $db->prepare('DELETE FROM `task_assignees` WHERE `user_id` = :userId');
                    $stmt->execute(['userId' => $id]);

                    // Delete the user
                    $stmt = $db->prepare('DELETE FROM `users` WHERE `id` = :id');
                    $stmt->execute(['id' => $id]);

                    $db->commit();
                } catch (\Exception $e) {
                    $db->rollBack();
                    error_log('Delete user error: ' . $e->getMessage());
                    $response->getBody()->write(json_encode([
                        'error' => 'Failed to delete user',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(500);
                }

                $response->getBody()->write(json_encode([
                    'message' => 'User deleted',
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

        })->add(new AdminMiddleware())->add(new AuthMiddleware());
    }

    /**
     * Shared target-permission rule for edit / delete / reset-password.
     * Admin callers may only act on member-role targets; owner callers may act
     * on any non-owner target. Returns a 403 response when denied, else null.
     * (Self-target is blocked earlier by each endpoint's own check.)
     */
    private static function denyIfTargetForbidden(string $callerRole, string $targetRole, Response $response): ?Response
    {
        $error = null;

        if ($callerRole === 'admin' && $targetRole !== 'member') {
            $error = 'You do not have permission to manage this user';
        } elseif ($callerRole === 'owner' && $targetRole === 'owner') {
            $error = 'Cannot modify the workspace owner';
        }

        if ($error === null) {
            return null;
        }

        $response->getBody()->write(json_encode(['error' => $error]));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(403);
    }
}
