<?php

namespace JamWork\Routes;

use JamWork\Lib\Validator;
use JamWork\Middleware\AuthMiddleware;
use JamWork\Services\ServiceException;
use JamWork\Services\SprintService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class SprintRoutes
{
    public static function register(App $app): void
    {
        $app->group('/sprints', function (RouteCollectorProxy $group) {

            // GET /sprints
            $group->get('', function (Request $request, Response $response) {
                $sprints = SprintService::listSprints($request->getQueryParams());

                return self::json($response, ['sprints' => $sprints]);
            });

            // POST /sprints
            $group->post('', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'required|min:1|max:100',
                    'startDate' => 'required|iso8601',
                    'endDate' => 'required|iso8601',
                    'projectId' => 'optional|nullable|uuid',
                    'description' => 'optional|max:500',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if (strtotime($data['endDate']) <= strtotime($data['startDate'])) {
                    return self::json($response, ['error' => 'End date must be after start date'], 400);
                }

                try {
                    $sprint = SprintService::createSprint($data, $request->getAttribute('userId'));
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['sprint' => $sprint], 201);
            });

            // PUT /sprints/{id}/close — must be before /{id} PUT
            $group->put('/{id}/close', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'action' => 'required|in:backlog,next_sprint',
                    'nextSprintId' => 'optional|uuid',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if ($data['action'] === 'next_sprint' && empty($data['nextSprintId'])) {
                    return self::json($response, ['error' => 'Next sprint ID is required when action is "next_sprint"'], 400);
                }

                try {
                    $incompleteTasks = SprintService::closeSprint($id, $data['action'], $data['nextSprintId'] ?? null);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, [
                    'message' => 'Sprint closed successfully',
                    'incompleteTasks' => $incompleteTasks,
                ]);
            });

            // GET /sprints/{id}
            $group->get('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                try {
                    $sprint = SprintService::getSprint($id);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['sprint' => $sprint]);
            });

            // PUT /sprints/{id}
            $group->put('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'optional|min:1|max:100',
                    'startDate' => 'optional|iso8601',
                    'endDate' => 'optional|iso8601',
                    'status' => 'optional|in:active,completed',
                    'description' => 'optional|nullable|max:500',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if (isset($data['startDate']) && isset($data['endDate'])) {
                    if (strtotime($data['endDate']) <= strtotime($data['startDate'])) {
                        return self::json($response, ['error' => 'End date must be after start date'], 400);
                    }
                }

                try {
                    $sprint = SprintService::updateSprint($id, $data);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['sprint' => $sprint]);
            });

            // DELETE /sprints/{id}
            $group->delete('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                try {
                    SprintService::deleteSprint($id);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['message' => 'Sprint deleted successfully']);
            });

        })->add(new AuthMiddleware());
    }

    /** Write a JSON body with the given status and content type. */
    private static function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
