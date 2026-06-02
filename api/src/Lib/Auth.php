<?php

namespace JamWork\Lib;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Psr\Http\Message\ResponseInterface as Response;

class Auth
{
    private const COOKIE_NAME = 'token';
    private const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

    /**
     * A fixed, valid bcrypt hash used to run a constant-time dummy verify when
     * a login email doesn't exist, so "no such user" costs the same as "wrong
     * password" (audit S6). It is not a credential for any account.
     */
    public const DUMMY_PASSWORD_HASH = '$2y$12$ckGpi7FjNYZxp/wqFPZP1e3r9P.2MkUjLtD0q2e0YAIjaaJQDfPWq';

    public static function generateToken(string $userId, string $role): string
    {
        $secret = $_ENV['JWT_SECRET'];
        $expiry = self::parseExpiry($_ENV['JWT_EXPIRY'] ?? '30d');

        $payload = [
            'userId' => $userId,
            'role' => $role,
            'iat' => time(),
            'exp' => time() + $expiry,
        ];

        return JWT::encode($payload, $secret, 'HS256');
    }

    public static function decodeToken(string $token): ?array
    {
        try {
            $secret = $_ENV['JWT_SECRET'];
            $decoded = JWT::decode($token, new Key($secret, 'HS256'));
            return (array) $decoded;
        } catch (\Exception $e) {
            return null;
        }
    }

    public static function setAuthCookie(Response $response, string $userId, string $role): Response
    {
        $token = self::generateToken($userId, $role);
        $secure = ($_ENV['APP_ENV'] ?? 'production') === 'production' ? '; Secure' : '';
        $expires = gmdate('D, d M Y H:i:s T', time() + self::COOKIE_MAX_AGE);

        $cookie = self::COOKIE_NAME . '=' . $token
            . '; Path=/'
            . '; HttpOnly'
            . $secure
            . '; SameSite=Lax'
            . '; Max-Age=' . self::COOKIE_MAX_AGE
            . '; Expires=' . $expires;

        return $response->withHeader('Set-Cookie', $cookie);
    }

    public static function clearAuthCookie(Response $response): Response
    {
        $secure = ($_ENV['APP_ENV'] ?? 'production') === 'production' ? '; Secure' : '';

        $cookie = self::COOKIE_NAME . '='
            . '; Path=/'
            . '; HttpOnly'
            . $secure
            . '; SameSite=Lax'
            . '; Max-Age=0'
            . '; Expires=' . gmdate('D, d M Y H:i:s T', 0);

        return $response->withHeader('Set-Cookie', $cookie);
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    public static function verifyPassword(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    private static function parseExpiry(string $expiry): int
    {
        $value = (int) $expiry;
        $unit = substr($expiry, -1);

        return match ($unit) {
            'd' => $value * 86400,
            'h' => $value * 3600,
            'm' => $value * 60,
            default => $value,
        };
    }
}
