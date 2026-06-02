<?php

namespace JamWork\Routes;

use JamWork\Lib\Database;
use JamWork\Lib\Validator;
use JamWork\Middleware\AuthMiddleware;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Ramsey\Uuid\Uuid;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class LabelRoutes
{

    private const FETCH_QUERY = '
        SELECT l.*,
               u.id AS creator_id, u.email AS creator_email, u.display_name AS creator_display_name
        FROM labels l
        JOIN users u ON l.created_by_id = u.id
    ';

    private static function mapLabel(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'color' => $row['color'],
            'createdAt' => date('c', strtotime($row['created_at'])),
            'createdBy' => [
                'id' => $row['creator_id'],
                'email' => $row['creator_email'],
                'displayName' => $row['creator_display_name'],
            ],
        ];
    }

    public static function register(App $app): void
    {
        $app->group('/labels', function (RouteCollectorProxy $group) {

            // GET /labels
            $group->get('', function (Request $request, Response $response) {
                $db = Database::getInstance();

                $stmt = $db->query(self::FETCH_QUERY . ' ORDER BY l.name ASC');
                $rows = $stmt->fetchAll();

                $labels = array_map([self::class, 'mapLabel'], $rows);

                $response->getBody()->write(json_encode(['labels' => $labels]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // POST /labels
            $group->post('', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'required|min:1|max:50',
                    'color' => 'required|hex_color',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();
                $userId = $request->getAttribute('userId');
                $id = Uuid::uuid4()->toString();

                $stmt = $db->prepare(
                    'INSERT INTO labels (id, name, color, created_by_id)
                     VALUES (:id, :name, :color, :created_by_id)'
                );
                $stmt->execute([
                    'id' => $id,
                    'name' => $data['name'],
                    'color' => $data['color'],
                    'created_by_id' => $userId,
                ]);

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE l.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['label' => self::mapLabel($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(201);
            });

            // PUT /labels/{id}
            $group->put('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'optional|min:1|max:50',
                    'color' => 'optional|hex_color',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM labels WHERE id = :id');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Label not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $updates = [];
                $params = ['id' => $id];

                if (isset($data['name'])) {
                    $updates[] = 'name = :name';
                    $params['name'] = $data['name'];
                }

                if (isset($data['color'])) {
                    $updates[] = 'color = :color';
                    $params['color'] = $data['color'];
                }

                if (!empty($updates)) {
                    $sql = 'UPDATE labels SET ' . implode(', ', $updates) . ' WHERE id = :id';
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);
                }

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE l.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['label' => self::mapLabel($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // DELETE /labels/{id}
            $group->delete('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!Validator::isUuid($id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM labels WHERE id = :id');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Label not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $stmt = $db->prepare('DELETE FROM labels WHERE id = :id');
                $stmt->execute(['id' => $id]);

                $response->getBody()->write(json_encode(['message' => 'Label deleted successfully']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

        })->add(new AuthMiddleware());
    }
}
