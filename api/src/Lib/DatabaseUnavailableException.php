<?php

namespace JamWork\Lib;

/**
 * Thrown when the database cannot be reached (e.g. MySQL is down). Distinct from
 * query errors so the error handler can answer with a 503 (transient) rather than
 * a 500 (bug).
 */
final class DatabaseUnavailableException extends \RuntimeException
{
}
