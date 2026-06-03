<?php

namespace Tests;

use PHPUnit\Framework\TestCase;
use JamWork\Lib\DatabaseUnavailableException;
use JamWork\Lib\DatabaseUnavailableHandler;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * The Slim error handler for a DB outage must answer 503 JSON (transient), not a
 * raw 500, and must not leak the underlying exception details.
 */
final class DatabaseUnavailableHandlerTest extends TestCase
{
    public function testReturns503JsonWithoutLeakingDetails(): void
    {
        $handler = new DatabaseUnavailableHandler();
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/tasks');

        $response = $handler(
            $request,
            new DatabaseUnavailableException('connect to 127.0.0.1:3306 failed'),
            true,  // displayErrorDetails — even when on, must not leak
            false,
            false
        );

        $this->assertSame(503, $response->getStatusCode());
        $this->assertSame('application/json', $response->getHeaderLine('Content-Type'));

        $body = (string) $response->getBody();
        $data = json_decode($body, true);
        $this->assertIsArray($data);
        $this->assertArrayHasKey('error', $data);
        $this->assertStringNotContainsString('127.0.0.1', $body);
    }
}
