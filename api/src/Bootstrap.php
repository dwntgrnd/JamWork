<?php

namespace JamWork;

use JamWork\Lib\DatabaseUnavailableException;
use JamWork\Lib\DatabaseUnavailableHandler;
use JamWork\Middleware\NoCacheMiddleware;
use JamWork\Middleware\RateLimitMiddleware;
use JamWork\Routes\AdminRoutes;
use JamWork\Routes\AuthRoutes;
use JamWork\Routes\CronRoutes;
use JamWork\Routes\WorkspaceSettingsRoutes;
use JamWork\Routes\ProjectRoutes;
use JamWork\Routes\LabelRoutes;
use JamWork\Routes\MilestoneRoutes;
use JamWork\Routes\ReportRoutes;
use JamWork\Routes\ReportScheduleRoutes;
use JamWork\Routes\TaskLinkRoutes;
use JamWork\Routes\SprintRoutes;
use JamWork\Routes\TaskRoutes;
use JamWork\Routes\UserPreferencesRoutes;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Factory\AppFactory;

class Bootstrap
{
    /**
     * Build the fully-configured Slim app (middleware stack, JSON error
     * handler, and all route groups) without running it. index.php calls
     * ->run() on the result; the integration test harness calls ->handle().
     *
     * Assumes environment variables are already loaded into $_ENV.
     */
    public static function createApp(): App
    {
        // Pin PHP to UTC so date/time math aligns with the UTC-pinned DB session
        // (Database.php). Both halves are required for correct Done-window/overdue.
        date_default_timezone_set('UTC');

        $app = AppFactory::create();
        $app->setBasePath('/api');

        // Middleware stack (executes bottom-to-top)
        $app->add(new NoCacheMiddleware());
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

        // A DB outage is transient — answer 503 (not a raw 500) without leaking details.
        $errorMiddleware->setErrorHandler(
            DatabaseUnavailableException::class,
            new DatabaseUnavailableHandler()
        );

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
        AdminRoutes::register($app);
        WorkspaceSettingsRoutes::register($app);
        ProjectRoutes::register($app);
        LabelRoutes::register($app);
        MilestoneRoutes::register($app);
        TaskLinkRoutes::register($app);
        SprintRoutes::register($app);
        TaskRoutes::register($app);
        ReportRoutes::register($app);
        ReportScheduleRoutes::register($app);
        UserPreferencesRoutes::register($app);
        CronRoutes::register($app);

        return $app;
    }
}
