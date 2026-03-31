<?php

namespace JamWork\Middleware;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use Slim\Psr7\Response as SlimResponse;

class RateLimitMiddleware implements MiddlewareInterface
{
    private int $maxRequests;
    private int $windowSeconds;
    private string $storageDir;

    public function __construct(int $maxRequests, int $windowSeconds)
    {
        $this->maxRequests = $maxRequests;
        $this->windowSeconds = $windowSeconds;
        $this->storageDir = sys_get_temp_dir() . '/jamwork_ratelimit';

        if (!is_dir($this->storageDir)) {
            @mkdir($this->storageDir, 0755, true);
        }
    }

    public static function loginLimiter(): self
    {
        return new self(20, 900); // 10 requests per 15 minutes
    }

    public static function generalLimiter(): self
    {
        return new self(1000, 900); // 1000 requests per 15 minutes
    }

    public function process(Request $request, RequestHandler $handler): Response
    {
        $ip = $request->getServerParams()['REMOTE_ADDR'] ?? '127.0.0.1';
        $key = hash('sha256', $ip);
        $file = $this->storageDir . '/' . $key . '.json';

        $now = time();
        $windowStart = $now - $this->windowSeconds;

        // Read existing records
        $requests = [];
        if (file_exists($file)) {
            $data = @file_get_contents($file);
            if ($data !== false) {
                $requests = json_decode($data, true) ?? [];
            }
        }

        // Filter to current window
        $requests = array_values(array_filter($requests, fn($ts) => $ts > $windowStart));

        if (count($requests) >= $this->maxRequests) {
            $retryAfter = ($requests[0] ?? $now) + $this->windowSeconds - $now;
            $response = new SlimResponse();
            $response->getBody()->write(json_encode([
                'error' => 'Too many requests. Please try again later.',
            ]));
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withHeader('Retry-After', (string) max(1, $retryAfter))
                ->withStatus(429);
        }

        // Record this request
        $requests[] = $now;
        @file_put_contents($file, json_encode($requests), LOCK_EX);

        // Probabilistic cleanup (1/100 requests)
        if (random_int(1, 100) === 1) {
            $this->cleanup($windowStart);
        }

        return $handler->handle($request);
    }

    private function cleanup(int $windowStart): void
    {
        $files = @glob($this->storageDir . '/*.json');
        if (!$files) {
            return;
        }

        foreach ($files as $file) {
            $mtime = @filemtime($file);
            if ($mtime !== false && $mtime < $windowStart) {
                @unlink($file);
            }
        }
    }
}
