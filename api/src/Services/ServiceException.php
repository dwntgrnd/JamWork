<?php

namespace JamWork\Services;

use RuntimeException;

/**
 * A domain error a service raises when it cannot fulfil a request (e.g. the
 * target row doesn't exist). Carries the HTTP status and client-facing message
 * the route should return, so services stay free of PSR-7 concerns.
 */
class ServiceException extends RuntimeException
{
    public function __construct(private readonly int $statusCode, string $message)
    {
        parent::__construct($message);
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}
