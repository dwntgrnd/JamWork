<?php

namespace JamWork\Routes;

use JamWork\Lib\Auth;
use JamWork\Lib\Database;
use JamWork\Lib\Mailer;
use JamWork\Lib\Validator;
use JamWork\Middleware\AuthMiddleware;
use JamWork\Middleware\RateLimitMiddleware;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Ramsey\Uuid\Uuid;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class AuthRoutes
{
    public static function register(App $app): void
    {
        $app->group('/auth', function (RouteCollectorProxy $group) {

            // GET /auth/status — public, no auth required
            $group->get('/status', function (Request $request, Response $response) {
                $db = Database::getInstance();
                $stmt = $db->query('SELECT COUNT(*) as count FROM users');
                $count = (int) $stmt->fetch()['count'];

                $response->getBody()->write(json_encode([
                    'hasAdmin' => $count > 0,
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // POST /auth/forgot-password — public, rate limited
            $group->post('/forgot-password', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'email' => 'required|email',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();
                $email = strtolower(trim($data['email']));

                // Always return success (anti-enumeration)
                $genericResponse = function () use ($response) {
                    $response->getBody()->write(json_encode([
                        'message' => 'If an account with that email exists, a password reset link has been sent.',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(200);
                };

                // Look up user
                $stmt = $db->prepare('SELECT id, email, display_name FROM users WHERE email = :email');
                $stmt->execute(['email' => $email]);
                $user = $stmt->fetch();

                if (!$user) {
                    return $genericResponse();
                }

                // Invalidate any existing tokens for this user
                $stmt = $db->prepare(
                    'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = :userId AND used_at IS NULL'
                );
                $stmt->execute(['userId' => $user['id']]);

                // Generate token: 32 bytes → URL-safe base64
                $rawToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
                $tokenHash = password_hash($rawToken, PASSWORD_BCRYPT, ['cost' => 12]);
                $tokenId = Uuid::uuid4()->toString();
                $expiresAt = date('Y-m-d H:i:s', time() + 3600); // 1 hour

                $stmt = $db->prepare(
                    'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
                     VALUES (:id, :userId, :tokenHash, :expiresAt)'
                );
                $stmt->execute([
                    'id' => $tokenId,
                    'userId' => $user['id'],
                    'tokenHash' => $tokenHash,
                    'expiresAt' => $expiresAt,
                ]);

                // Send email
                if (Mailer::isConfigured()) {
                    $mailer = new Mailer();
                    $appUrl = $_ENV['APP_URL'] ?? '';
                    $resetUrl = $appUrl . '/set-new-password?token=' . $rawToken;

                    // Get workspace name
                    $stmt = $db->prepare('SELECT `value` FROM `workspace_settings` WHERE `key` = :key');
                    $stmt->execute(['key' => 'workspace_name']);
                    $wsRow = $stmt->fetch();
                    $workspaceName = $wsRow ? $wsRow['value'] : 'JamWork';

                    $mailer->sendPasswordResetEmail(
                        $user['email'],
                        $user['display_name'],
                        $resetUrl,
                        $workspaceName
                    );
                }

                return $genericResponse();
            })->add(RateLimitMiddleware::loginLimiter());

            // POST /auth/set-new-password — public, rate limited
            $group->post('/set-new-password', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'token' => 'required',
                    'newPassword' => 'required|min:10',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();
                $rawToken = $data['token'];

                // Find all non-expired, non-used tokens
                $stmt = $db->prepare(
                    'SELECT prt.id, prt.user_id, prt.token_hash, prt.expires_at
                     FROM password_reset_tokens prt
                     WHERE prt.used_at IS NULL AND prt.expires_at > NOW()
                     ORDER BY prt.created_at DESC'
                );
                $stmt->execute();
                $tokens = $stmt->fetchAll();

                // Verify the raw token against stored hashes
                $matchedToken = null;
                foreach ($tokens as $tokenRow) {
                    if (password_verify($rawToken, $tokenRow['token_hash'])) {
                        $matchedToken = $tokenRow;
                        break;
                    }
                }

                if (!$matchedToken) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Invalid or expired reset link. Please request a new one.',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                // Update password
                $passwordHash = Auth::hashPassword($data['newPassword']);
                $stmt = $db->prepare(
                    'UPDATE users SET password_hash = :hash, must_reset_password = 0, token_version = token_version + 1 WHERE id = :id'
                );
                $stmt->execute(['hash' => $passwordHash, 'id' => $matchedToken['user_id']]);

                // Mark token as used
                $stmt = $db->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id');
                $stmt->execute(['id' => $matchedToken['id']]);

                $response->getBody()->write(json_encode([
                    'message' => 'Password has been reset. You can now log in.',
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(RateLimitMiddleware::loginLimiter());

            // POST /auth/signup
            $group->post('/signup', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'email' => 'required|email',
                    'password' => 'required|min:10',
                    'displayName' => 'required|min:1|max:100',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                // Check if any users exist — first user becomes admin, rest blocked
                $stmt = $db->query('SELECT COUNT(*) as count FROM users');
                $count = (int) $stmt->fetch()['count'];

                if ($count > 0) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Registration is disabled. Contact your admin for an invitation.',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(403);
                }

                $email = strtolower(trim($data['email']));
                $passwordHash = Auth::hashPassword($data['password']);
                $displayName = trim($data['displayName']);
                $userId = Uuid::uuid4()->toString();

                try {
                    $stmt = $db->prepare(
                        'INSERT INTO users (id, email, password_hash, display_name, role, must_reset_password)
                         VALUES (:id, :email, :password_hash, :display_name, :role, :must_reset_password)'
                    );
                    $stmt->execute([
                        'id' => $userId,
                        'email' => $email,
                        'password_hash' => $passwordHash,
                        'display_name' => $displayName,
                        'role' => 'admin',
                        'must_reset_password' => 0,
                    ]);
                } catch (\PDOException $e) {
                    // Duplicate email
                    if ($e->getCode() == 23000) {
                        $response->getBody()->write(json_encode([
                            'error' => 'An account with this email already exists',
                        ]));
                        return $response
                            ->withHeader('Content-Type', 'application/json')
                            ->withStatus(400);
                    }
                    throw $e;
                }

                $response = Auth::setAuthCookie($response, $userId, 'admin', 0);
                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $userId,
                        'email' => $email,
                        'displayName' => $displayName,
                        'role' => 'admin',
                        // New user → all notification preferences default ON.
                        'notifyAssigned' => true,
                        'notifyUnassigned' => true,
                        'notifyChanged' => true,
                    ],
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(201);
            });

            // POST /auth/login
            $group->post('/login', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'email' => 'required|email',
                    'password' => 'required',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();
                $email = strtolower(trim($data['email']));

                $stmt = $db->prepare('SELECT * FROM users WHERE email = :email');
                $stmt->execute(['email' => $email]);
                $user = $stmt->fetch();

                // Same error for missing user and wrong password (prevent enumeration).
                $invalidCredentials = function () use ($response) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Invalid email or password',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(401);
                };

                if (!$user) {
                    // Constant-time: a missing user costs the same bcrypt verify as a wrong password (S6).
                    Auth::verifyPassword($data['password'], Auth::DUMMY_PASSWORD_HASH);
                    return $invalidCredentials();
                }

                if (!Auth::verifyPassword($data['password'], $user['password_hash'])) {
                    return $invalidCredentials();
                }

                $response = Auth::setAuthCookie($response, $user['id'], $user['role'], (int) $user['token_version']);
                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $user['id'],
                        'email' => $user['email'],
                        'displayName' => $user['display_name'],
                        'role' => $user['role'],
                        'mustResetPassword' => (bool) $user['must_reset_password'],
                        'notifyAssigned' => (bool) $user['notify_assigned'],
                        'notifyUnassigned' => (bool) $user['notify_unassigned'],
                        'notifyChanged' => (bool) $user['notify_changed'],
                    ],
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(RateLimitMiddleware::loginLimiter());

            // POST /auth/logout
            $group->post('/logout', function (Request $request, Response $response) {
                $response = Auth::clearAuthCookie($response);
                $response->getBody()->write(json_encode(['message' => 'Logged out']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // GET /auth/me
            $group->get('/me', function (Request $request, Response $response) {
                $userId = $request->getAttribute('userId');
                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, email, display_name, role, must_reset_password, notify_assigned, notify_unassigned, notify_changed FROM users WHERE id = :id');
                $stmt->execute(['id' => $userId]);
                $user = $stmt->fetch();

                if (!$user) {
                    $response = Auth::clearAuthCookie($response);
                    $response->getBody()->write(json_encode(['error' => 'User not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(401);
                }

                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $user['id'],
                        'email' => $user['email'],
                        'displayName' => $user['display_name'],
                        'role' => $user['role'],
                        'mustResetPassword' => (bool) $user['must_reset_password'],
                        'notifyAssigned' => (bool) $user['notify_assigned'],
                        'notifyUnassigned' => (bool) $user['notify_unassigned'],
                        'notifyChanged' => (bool) $user['notify_changed'],
                    ],
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AuthMiddleware());

            // PUT /auth/reset-password
            $group->put('/reset-password', function (Request $request, Response $response) {
                $userId = $request->getAttribute('userId');
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'newPassword' => 'required|min:10',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, must_reset_password FROM users WHERE id = :id');
                $stmt->execute(['id' => $userId]);
                $user = $stmt->fetch();

                if (!$user) {
                    $response->getBody()->write(json_encode(['error' => 'User not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                if (!(bool) $user['must_reset_password']) {
                    $response->getBody()->write(json_encode(['error' => 'Password reset not required']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $passwordHash = Auth::hashPassword($data['newPassword']);
                $stmt = $db->prepare('UPDATE users SET password_hash = :hash, must_reset_password = 0, token_version = token_version + 1 WHERE id = :id');
                $stmt->execute(['hash' => $passwordHash, 'id' => $userId]);

                $response->getBody()->write(json_encode(['message' => 'Password reset successfully']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AuthMiddleware());

            // PUT /auth/profile
            $group->put('/profile', function (Request $request, Response $response) {
                $userId = $request->getAttribute('userId');
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'email' => 'optional|email',
                    'displayName' => 'optional|min:1|max:100',
                    'notifyAssigned' => 'optional|boolean',
                    'notifyUnassigned' => 'optional|boolean',
                    'notifyChanged' => 'optional|boolean',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT * FROM users WHERE id = :id');
                $stmt->execute(['id' => $userId]);
                $currentUser = $stmt->fetch();

                if (!$currentUser) {
                    $response->getBody()->write(json_encode(['error' => 'User not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $updates = [];
                $params = ['id' => $userId];

                if (isset($data['email'])) {
                    $emailLower = strtolower(trim($data['email']));
                    if ($emailLower !== $currentUser['email']) {
                        // Check for existing email
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

                foreach (['notifyAssigned' => 'notify_assigned', 'notifyUnassigned' => 'notify_unassigned', 'notifyChanged' => 'notify_changed'] as $field => $column) {
                    if (array_key_exists($field, $data)) {
                        $updates[] = "{$column} = :{$column}";
                        $params[$column] = $data[$field] ? 1 : 0;
                    }
                }

                if (!empty($updates)) {
                    $sql = 'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id';
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);
                }

                // Fetch updated user
                $stmt = $db->prepare('SELECT id, email, display_name, role, must_reset_password, notify_assigned, notify_unassigned, notify_changed FROM users WHERE id = :id');
                $stmt->execute(['id' => $userId]);
                $updated = $stmt->fetch();

                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $updated['id'],
                        'email' => $updated['email'],
                        'displayName' => $updated['display_name'],
                        'role' => $updated['role'],
                        'mustResetPassword' => (bool) $updated['must_reset_password'],
                        'notifyAssigned' => (bool) $updated['notify_assigned'],
                        'notifyUnassigned' => (bool) $updated['notify_unassigned'],
                        'notifyChanged' => (bool) $updated['notify_changed'],
                    ],
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AuthMiddleware());

            // PUT /auth/change-password
            $group->put('/change-password', function (Request $request, Response $response) {
                $userId = $request->getAttribute('userId');
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'currentPassword' => 'required',
                    'newPassword' => 'required|min:10',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, password_hash FROM users WHERE id = :id');
                $stmt->execute(['id' => $userId]);
                $user = $stmt->fetch();

                if (!$user) {
                    $response->getBody()->write(json_encode(['error' => 'User not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                if (!Auth::verifyPassword($data['currentPassword'], $user['password_hash'])) {
                    $response->getBody()->write(json_encode(['error' => 'Current password is incorrect']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(401);
                }

                $passwordHash = Auth::hashPassword($data['newPassword']);
                $stmt = $db->prepare('UPDATE users SET password_hash = :hash, token_version = token_version + 1 WHERE id = :id');
                $stmt->execute(['hash' => $passwordHash, 'id' => $userId]);

                $response->getBody()->write(json_encode(['message' => 'Password changed successfully']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AuthMiddleware());

            // GET /auth/users
            $group->get('/users', function (Request $request, Response $response) {
                $db = Database::getInstance();
                $isAdmin = $request->getAttribute('role') === 'admin';

                $stmt = $db->query('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at ASC');
                $users = $stmt->fetchAll();

                // Non-admins receive only id/displayName/role (no email roster) — audit S7.
                $mapped = array_map(function ($u) use ($isAdmin) {
                    $entry = [
                        'id' => $u['id'],
                        'displayName' => $u['display_name'],
                        'role' => $u['role'],
                    ];
                    if ($isAdmin) {
                        $entry['email'] = $u['email'];
                        $entry['createdAt'] = date('c', strtotime($u['created_at']));
                    }
                    return $entry;
                }, $users);

                $response->getBody()->write(json_encode(['users' => $mapped]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AuthMiddleware());
        });
    }
}
