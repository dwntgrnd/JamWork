<?php

namespace JamWork\Lib;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Response;
use Throwable;

/**
 * Slim error handler for DatabaseUnavailableException: answer 503 (transient) with
 * a generic JSON message, never leaking connection details to the client.
 */
final class DatabaseUnavailableHandler
{
    public function __invoke(
        ServerRequestInterface $request,
        Throwable $exception,
        bool $displayErrorDetails,
        bool $logErrors,
        bool $logErrorDetails
    ): ResponseInterface {
        $response = new Response();
        $response->getBody()->write(json_encode([
            'error' => 'Service temporarily unavailable. Please try again shortly.',
        ]));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Retry-After', '10')
            ->withStatus(503);
    }
}
