<?php

namespace JamWork\Routes;

use JamWork\Lib\Validator;
use JamWork\Middleware\AuthMiddleware;
use JamWork\Services\ServiceException;
use JamWork\Services\TaskService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class TaskRoutes
{
    public static function register(App $app): void
    {
        $app->group('/tasks', function (RouteCollectorProxy $group) {

            // ============================================================
            // STATIC ROUTES (must come before /{id} parameterized routes)
            // ============================================================

            // PUT /tasks/reorder
            $group->put('/reorder', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, ['taskIds' => 'required|uuid_array']);
                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                TaskService::reorder($data['taskIds']);

                return self::json($response, ['message' => 'Tasks reordered successfully']);
            });

            // PUT /tasks/bulk-update
            $group->put('/bulk-update', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                // Validate taskIds
                if (!isset($data['taskIds']) || !is_array($data['taskIds']) || empty($data['taskIds'])) {
                    return self::json($response, ['error' => 'taskIds must be a non-empty array of UUIDs'], 400);
                }
                foreach ($data['taskIds'] as $taskId) {
                    if (!Validator::isUuid($taskId)) {
                        return self::json($response, ['error' => 'taskIds must contain only valid UUIDs'], 400);
                    }
                }

                // Validate fields
                if (!isset($data['fields']) || !is_array($data['fields']) || empty($data['fields'])) {
                    return self::json($response, ['error' => 'fields must be a non-empty object'], 400);
                }

                $allowedFields = ['status', 'priority', 'sprintId', 'inSprintBacklog'];
                foreach (array_keys($data['fields']) as $key) {
                    if (!in_array($key, $allowedFields, true)) {
                        return self::json($response, ['error' => "Field '{$key}' is not allowed"], 400);
                    }
                }

                $fieldErrors = Validator::validate($data['fields'], [
                    'status' => 'in:todo,in_progress,blocked,review,done',
                    'priority' => 'in:low,medium,high,urgent',
                    'sprintId' => 'nullable|uuid',
                    'inSprintBacklog' => 'boolean',
                ]);
                if (!empty($fieldErrors)) {
                    return Validator::respondWithErrors($response, $fieldErrors);
                }

                $count = TaskService::bulkUpdate($data['taskIds'], $data['fields']);

                return self::json($response, ['count' => $count]);
            });

            // POST /tasks/bulk-delete
            $group->post('/bulk-delete', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, ['taskIds' => 'required|uuid_array']);
                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if (empty($data['taskIds'])) {
                    return self::json($response, ['error' => 'taskIds must be a non-empty array'], 400);
                }

                $count = TaskService::bulkDelete($data['taskIds']);

                return self::json($response, ['count' => $count]);
            });

            // ============================================================
            // COLLECTION ROUTES
            // ============================================================

            // GET /tasks — filtered list
            $group->get('', function (Request $request, Response $response) {
                $tasks = TaskService::listTasks(
                    $request->getQueryParams(),
                    $request->getAttribute('userId')
                );

                return self::json($response, ['tasks' => $tasks]);
            });

            // POST /tasks — create
            $group->post('', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'title' => 'required|min:1|max:255',
                    'description' => 'optional|nullable',
                    'notes' => 'optional|nullable',
                    'status' => 'optional|in:todo,in_progress,blocked,review,done',
                    'priority' => 'optional|in:low,medium,high,urgent',
                    'dueDate' => 'optional|nullable|iso8601',
                    'startDate' => 'optional|nullable|iso8601',
                    'recurrence' => 'optional|nullable|in:daily,weekly,biweekly,monthly',
                    'effort' => 'optional|nullable|in:1,2,4,8',
                    'sprintId' => 'optional|nullable|uuid',
                    'projectId' => 'required|uuid',
                    'assigneeIds' => 'optional|uuid_array',
                    'labelIds' => 'optional|uuid_array',
                    'notifyEnabled' => 'optional|boolean',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                try {
                    $task = TaskService::createTask($data, $request->getAttribute('userId'));
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['task' => $task], 201);
            });

            // ============================================================
            // PARAMETERIZED ROUTES (/{id} and /{id}/*)
            // ============================================================

            // PUT /tasks/{id}/move — must be before /{id} PUT
            $group->put('/{id}/move', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, ['projectId' => 'required|uuid']);
                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                try {
                    $task = TaskService::moveTask($id, $data['projectId']);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['task' => $task]);
            });

            // GET /tasks/{id}
            $group->get('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                try {
                    $task = TaskService::getTask($id);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['task' => $task]);
            });

            // PUT /tasks/{id} — update with recurrence clone
            $group->put('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'title' => 'optional|min:1|max:255',
                    'description' => 'optional|nullable',
                    'notes' => 'optional|nullable',
                    'status' => 'optional|in:todo,in_progress,blocked,review,done',
                    'priority' => 'optional|in:low,medium,high,urgent',
                    'dueDate' => 'optional|nullable|iso8601',
                    'startDate' => 'optional|nullable|iso8601',
                    'recurrence' => 'optional|nullable|in:daily,weekly,biweekly,monthly',
                    'effort' => 'optional|nullable|in:1,2,4,8',
                    'sprintId' => 'optional|nullable|uuid',
                    'assigneeIds' => 'optional|uuid_array',
                    'labelIds' => 'optional|uuid_array',
                    'notifyEnabled' => 'optional|boolean',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                try {
                    $result = TaskService::updateTask($id, $data, $request->getAttribute('userId'));
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, $result);
            });

            // DELETE /tasks/{id} — soft-delete
            $group->delete('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                try {
                    TaskService::deleteTask($id);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['message' => 'Task deleted successfully']);
            });

            // ============================================================
            // SUBTASK ROUTES
            // ============================================================

            // POST /tasks/{id}/subtasks
            $group->post('/{id}/subtasks', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, ['title' => 'required|min:1|max:255']);
                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                try {
                    $subtask = TaskService::createSubtask($id, $data['title']);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['subtask' => $subtask], 201);
            });

            // PUT /tasks/{taskId}/subtasks/{subtaskId}
            $group->put('/{taskId}/subtasks/{subtaskId}', function (Request $request, Response $response, array $args) {
                $taskId = $args['taskId'];
                $subtaskId = $args['subtaskId'];

                if (!Validator::isUuid($taskId)) {
                    return self::json($response, ['error' => 'taskId must be a valid UUID'], 400);
                }
                if (!Validator::isUuid($subtaskId)) {
                    return self::json($response, ['error' => 'subtaskId must be a valid UUID'], 400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'title' => 'optional|min:1|max:255',
                    'completed' => 'optional|boolean',
                ]);
                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if (!array_key_exists('title', $data) && !array_key_exists('completed', $data)) {
                    return self::json($response, ['error' => 'At least one field (title or completed) must be provided'], 400);
                }

                try {
                    $subtask = TaskService::updateSubtask($taskId, $subtaskId, $data);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['subtask' => $subtask]);
            });

            // DELETE /tasks/{taskId}/subtasks/{subtaskId}
            $group->delete('/{taskId}/subtasks/{subtaskId}', function (Request $request, Response $response, array $args) {
                $taskId = $args['taskId'];
                $subtaskId = $args['subtaskId'];

                if (!Validator::isUuid($taskId)) {
                    return self::json($response, ['error' => 'taskId must be a valid UUID'], 400);
                }
                if (!Validator::isUuid($subtaskId)) {
                    return self::json($response, ['error' => 'subtaskId must be a valid UUID'], 400);
                }

                try {
                    TaskService::deleteSubtask($taskId, $subtaskId);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['message' => 'Subtask deleted successfully']);
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
