<?php

namespace Tests;

use PHPUnit\Framework\TestCase;
use JamWork\Middleware\RateLimitMiddleware;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Response as SlimResponse;

/**
 * Regression test for the morning-incident "Too many requests" bug (audit S4 follow-up):
 * the global generalLimiter and the per-route loginLimiter must NOT share a counter
 * bucket. Normal browsing (general limiter) must not consume the login budget.
 */
final class RateLimitMiddlewareTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/jamwork_rl_test_' . bin2hex(random_bytes(6));
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/*.json') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($this->dir);
    }

    private function passThroughHandler(): RequestHandlerInterface
    {
        return new class implements RequestHandlerInterface {
            public function handle(Request $request): ResponseInterface
            {
                return new SlimResponse(200);
            }
        };
    }

    private function requestFrom(string $ip): Request
    {
        return (new ServerRequestFactory())
            ->createServerRequest('POST', '/login', ['REMOTE_ADDR' => $ip]);
    }

    public function testLoginLimiterHasSeparateBudgetFromGeneralTraffic(): void
    {
        $ip = '198.51.100.77'; // TEST-NET-2, unique to this test
        $general = RateLimitMiddleware::generalLimiter($this->dir);
        $login   = RateLimitMiddleware::loginLimiter($this->dir);
        $handler = $this->passThroughHandler();

        // Normal browsing: 25 general-limited requests (well under general's 1000).
        for ($i = 0; $i < 25; $i++) {
            $this->assertSame(
                200,
                $general->process($this->requestFrom($ip), $handler)->getStatusCode(),
                "general request #$i should pass (limit is 1000)"
            );
        }

        // A first login attempt from the same IP must NOT be throttled: the login
        // limiter has its own 20/15min budget, independent of general browsing.
        $this->assertSame(
            200,
            $login->process($this->requestFrom($ip), $handler)->getStatusCode(),
            'first login attempt must not be rate-limited by general browsing traffic'
        );
    }
}
