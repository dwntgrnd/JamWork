<?php

namespace JamWork\Middleware;

use JamWork\Lib\Auth;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use Slim\Psr7\Response as SlimResponse;

class AuthMiddleware implements MiddlewareInterface
{
    private const TOKEN_REFRESH_THRESHOLD = 86400; // 24 hours

    public function process(Request $request, RequestHandler $handler): Response
    {
        $cookies = $request->getCookieParams();
        $token = $cookies['token'] ?? null;

        if (!$token) {
            return $this->unauthorized('Authentication required');
        }

        $payload = Auth::decodeToken($token);

        if (!$payload || !isset($payload['userId'], $payload['role'])) {
            return $this->unauthorized('Session expired. Please log in again.');
        }

        // Attach user info to request
        $request = $request
            ->withAttribute('userId', $payload['userId'])
            ->withAttribute('role', $payload['role']);

        $response = $handler->handle($request);

        // Sliding session: refresh if token is older than 24 hours
        $tokenAge = time() - ($payload['iat'] ?? time());
        if ($tokenAge > self::TOKEN_REFRESH_THRESHOLD) {
            $response = Auth::setAuthCookie($response, $payload['userId'], $payload['role']);
        }

        return $response;
    }

    private function unauthorized(string $message): Response
    {
        $response = new SlimResponse();
        $response->getBody()->write(json_encode(['error' => $message]));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(401);
    }
}
