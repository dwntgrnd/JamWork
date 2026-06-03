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
    private string $bucket;
    private string $storageDir;

    public function __construct(int $maxRequests, int $windowSeconds, string $bucket = 'default', ?string $storageDir = null)
    {
        $this->maxRequests = $maxRequests;
        $this->windowSeconds = $windowSeconds;
        $this->bucket = $bucket;
        $this->storageDir = $storageDir ?? sys_get_temp_dir() . '/jamwork_ratelimit';

        if (!is_dir($this->storageDir)) {
            @mkdir($this->storageDir, 0755, true);
        }
    }

    public static function loginLimiter(?string $storageDir = null): self
    {
        return new self(20, 900, 'login', $storageDir); // 20 requests per 15 minutes
    }

    public static function generalLimiter(?string $storageDir = null): self
    {
        return new self(1000, 900, 'general', $storageDir); // 1000 requests per 15 minutes
    }

    /**
     * Resolve the client IP for rate-limit keying.
     *
     * Default: REMOTE_ADDR. When RATE_LIMIT_TRUSTED_PROXY is enabled, take the
     * RIGHT-MOST X-Forwarded-For entry — the hop a single trusted reverse proxy
     * appends — since earlier entries are attacker-controllable (audit S4).
     */
    public static function resolveClientIp(array $serverParams, ?string $forwardedFor, bool $trustProxy): string
    {
        if ($trustProxy && $forwardedFor !== null && trim($forwardedFor) !== '') {
            $parts = array_values(array_filter(
                array_map('trim', explode(',', $forwardedFor)),
                fn($p) => $p !== ''
            ));
            if (!empty($parts)) {
                return end($parts);
            }
        }
        return $serverParams['REMOTE_ADDR'] ?? '127.0.0.1';
    }

    public function process(Request $request, RequestHandler $handler): Response
    {
        $trustProxy = filter_var($_ENV['RATE_LIMIT_TRUSTED_PROXY'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $forwardedFor = $request->getHeaderLine('X-Forwarded-For');
        $ip = self::resolveClientIp(
            $request->getServerParams(),
            $forwardedFor === '' ? null : $forwardedFor,
            $trustProxy
        );
        // Namespace the counter by limiter bucket so independent limiters (e.g. the
        // global generalLimiter and the per-route loginLimiter) don't share a budget.
        $key = hash('sha256', $this->bucket . '|' . $ip);
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
