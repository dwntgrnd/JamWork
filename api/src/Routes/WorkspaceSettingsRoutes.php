<?php

namespace JamWork\Routes;

use JamWork\Lib\Database;
use JamWork\Lib\Validator;
use JamWork\Middleware\AdminMiddleware;
use JamWork\Middleware\AuthMiddleware;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class WorkspaceSettingsRoutes
{
    public static function register(App $app): void
    {
        $app->group('/workspace-settings', function (RouteCollectorProxy $group) {

            // GET /workspace-settings
            $group->get('', function (Request $request, Response $response) {
                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT `value` FROM `workspace_settings` WHERE `key` = :key');
                $stmt->execute(['key' => 'workspace_name']);
                $row = $stmt->fetch();

                if (!$row) {
                    // Create default
                    $stmt = $db->prepare(
                        'INSERT INTO `workspace_settings` (`id`, `key`, `value`) VALUES (:id, :key, :value)'
                    );
                    $stmt->execute([
                        'id' => \Ramsey\Uuid\Uuid::uuid4()->toString(),
                        'key' => 'workspace_name',
                        'value' => 'TeamTask',
                    ]);
                    $workspaceName = 'TeamTask';
                } else {
                    $workspaceName = $row['value'];
                }

                $response->getBody()->write(json_encode([
                    'workspaceName' => $workspaceName,
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AuthMiddleware());

            // PUT /workspace-settings
            $group->put('', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'required|min:1|max:50',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();
                $name = trim($data['name']);

                // Upsert: try update first, then insert if no rows affected
                $stmt = $db->prepare('UPDATE `workspace_settings` SET `value` = :value WHERE `key` = :key');
                $stmt->execute(['value' => $name, 'key' => 'workspace_name']);

                if ($stmt->rowCount() === 0) {
                    $stmt = $db->prepare(
                        'INSERT INTO `workspace_settings` (`id`, `key`, `value`) VALUES (:id, :key, :value)'
                    );
                    $stmt->execute([
                        'id' => \Ramsey\Uuid\Uuid::uuid4()->toString(),
                        'key' => 'workspace_name',
                        'value' => $name,
                    ]);
                }

                $response->getBody()->write(json_encode([
                    'workspaceName' => $name,
                ]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            })->add(new AdminMiddleware())->add(new AuthMiddleware());
        });
    }
}
