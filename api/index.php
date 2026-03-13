<?php

require __DIR__ . '/vendor/autoload.php';

date_default_timezone_set('UTC');

use Dotenv\Dotenv;
use JamWork\Middleware\RateLimitMiddleware;
use JamWork\Routes\AuthRoutes;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

// Load environment variables
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();
$dotenv->required(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SECRET']);

$app = AppFactory::create();
$app->setBasePath('/api');

// Middleware stack (executes bottom-to-top)
$app->addBodyParsingMiddleware();
$app->add(RateLimitMiddleware::generalLimiter());
$app->addRoutingMiddleware();

// Error middleware — always return JSON
$errorMiddleware = $app->addErrorMiddleware(
    $_ENV['APP_ENV'] === 'development',
    true,
    true
);

$errorHandler = $errorMiddleware->getDefaultErrorHandler();
$errorHandler->forceContentType('application/json');

// Routes
$app->get('/health', function (Request $request, Response $response) {
    $payload = json_encode([
        'status' => 'ok',
        'timestamp' => round(microtime(true) * 1000),
    ]);
    $response->getBody()->write($payload);
    return $response->withHeader('Content-Type', 'application/json');
});

AuthRoutes::register($app);

$app->run();
