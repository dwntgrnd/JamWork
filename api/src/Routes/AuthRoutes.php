<?php

namespace JamWork\Routes;

use JamWork\Lib\Auth;
use JamWork\Lib\Database;
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

            // POST /auth/signup
            $group->post('/signup', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'email' => 'required|email',
                    'password' => 'required|min:8',
                    'displayName' => 'required|min:1|max:255',
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

                $response = Auth::setAuthCookie($response, $userId, 'admin');
                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $userId,
                        'email' => $email,
                        'displayName' => $displayName,
                        'role' => 'admin',
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

                // Same error for missing user and wrong password (prevent enumeration)
                if (!$user || !Auth::verifyPassword($data['password'], $user['password_hash'])) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Invalid email or password',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(401);
                }

                $response = Auth::setAuthCookie($response, $user['id'], $user['role']);
                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $user['id'],
                        'email' => $user['email'],
                        'displayName' => $user['display_name'],
                        'role' => $user['role'],
                        'mustResetPassword' => (bool) $user['must_reset_password'],
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

                $stmt = $db->prepare('SELECT id, email, display_name, role, must_reset_password FROM users WHERE id = :id');
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
                    'newPassword' => 'required|min:8',
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
                $stmt = $db->prepare('UPDATE users SET password_hash = :hash, must_reset_password = 0 WHERE id = :id');
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
                    'displayName' => 'optional|min:1|max:255',
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

                if (!empty($updates)) {
                    $sql = 'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id';
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);
                }

                // Fetch updated user
                $stmt = $db->prepare('SELECT id, email, display_name, role, must_reset_password FROM users WHERE id = :id');
                $stmt->execute(['id' => $userId]);
                $updated = $stmt->fetch();

                $response->getBody()->write(json_encode([
                    'user' => [
                        'id' => $updated['id'],
                        'email' => $updated['email'],
                        'displayName' => $updated['display_name'],
                        'role' => $updated['role'],
                        'mustResetPassword' => (bool) $updated['must_reset_password'],
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
                    'newPassword' => 'required|min:8',
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
                $stmt = $db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
                $stmt->execute(['hash' => $passwordHash, 'id' => $userId]);

                $response->getBody()->write(json_encode(['message' => 'Password changed successfully']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AuthMiddleware());

            // GET /auth/users
            $group->get('/users', function (Request $request, Response $response) {
                $db = Database::getInstance();

                $stmt = $db->query('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at ASC');
                $users = $stmt->fetchAll();

                // Map to camelCase response
                $mapped = array_map(fn($u) => [
                    'id' => $u['id'],
                    'email' => $u['email'],
                    'displayName' => $u['display_name'],
                    'role' => $u['role'],
                    'createdAt' => $u['created_at'],
                ], $users);

                $response->getBody()->write(json_encode(['users' => $mapped]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AuthMiddleware());
        });
    }
}
