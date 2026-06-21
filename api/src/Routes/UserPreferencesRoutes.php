<?php

namespace JamWork\Routes;

use JamWork\Lib\Database;
use JamWork\Lib\Validator;
use JamWork\Middleware\AuthMiddleware;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

/**
 * Per-user preferences store (CC37). A single generic JSON column on `users`
 * holds top-level namespaced settings; today only the `sidebar` namespace
 * (All/Mine project filtering) is written. Every operation is scoped to the
 * authenticated user — there is no cross-user access.
 *
 * Storage contract:
 *   { "sidebar": { "view": "all"|"mine", "pinnedProjects": ["<uuid>", ...] } }
 *
 * `pinnedProjects` holds project UUIDs (CHAR(36)) — not integers. Stale IDs
 * (projects since deleted) are accepted on write and filtered out client-side;
 * the store never validates them against live projects.
 */
class UserPreferencesRoutes
{
    public static function register(App $app): void
    {
        $app->group('/user', function (RouteCollectorProxy $group) {

            // GET /user/preferences — the caller's preferences, {} when unset.
            $group->get('/preferences', function (Request $request, Response $response) {
                $prefs = self::loadPreferences($request->getAttribute('userId'));
                return self::jsonPreferences($response, $prefs);
            });

            // PUT /user/preferences — validate, then merge at the top-level
            // namespace key (a whole namespace is replaced; siblings untouched).
            $group->put('/preferences', function (Request $request, Response $response) {
                $userId = $request->getAttribute('userId');
                $data = $request->getParsedBody();
                if (!is_array($data)) {
                    $data = [];
                }

                if ($errors = self::validate($data)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $merged = array_merge(self::loadPreferences($userId), $data);

                $db = Database::getInstance();
                $stmt = $db->prepare('UPDATE users SET preferences = :p WHERE id = :id');
                $stmt->execute(['p' => self::encode($merged), 'id' => $userId]);

                return self::jsonPreferences($response, $merged);
            });

        })->add(new AuthMiddleware());
    }

    /** Read + decode the user's preferences column; [] when null/absent. */
    private static function loadPreferences(string $userId): array
    {
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT preferences FROM users WHERE id = :id');
        $stmt->execute(['id' => $userId]);
        $raw = $stmt->fetchColumn();

        if ($raw === false || $raw === null) {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /** Top-level preference namespaces this endpoint will accept on write. */
    private const ALLOWED_NAMESPACES = ['sidebar'];

    /**
     * Validate the incoming (partial) preferences object. Only known top-level
     * namespaces are writable — unknown keys are rejected so the store can't be
     * used as an unbounded dumping ground (a future namespace is added here and
     * to ALLOWED_NAMESPACES together). The `sidebar` namespace is then
     * constrained. Returns a list of {field,message} errors, or null when valid.
     */
    private static function validate(array $data): ?array
    {
        foreach (array_keys($data) as $key) {
            if (!in_array($key, self::ALLOWED_NAMESPACES, true)) {
                return [['field' => (string) $key, 'message' => "Unknown preference: {$key}"]];
            }
        }

        if (!array_key_exists('sidebar', $data)) {
            return null;
        }
        if (!is_array($data['sidebar'])) {
            return [['field' => 'sidebar', 'message' => 'sidebar must be an object']];
        }

        // `view` must be a string: the shared `in:` rule skips non-scalars, so an
        // array/object view would otherwise slip through validation as "valid".
        if (array_key_exists('view', $data['sidebar']) && !is_string($data['sidebar']['view'])) {
            return [['field' => 'view', 'message' => 'view must be one of: all, mine']];
        }

        $errors = Validator::validate($data['sidebar'], [
            'view' => 'optional|in:all,mine',
            'pinnedProjects' => 'optional|uuid_array',
        ]);

        return $errors === [] ? null : $errors;
    }

    /** JSON-encode preferences, rendering an empty store as `{}` (never `[]`). */
    private static function encode(array $prefs): string
    {
        return json_encode($prefs === [] ? new \stdClass() : $prefs);
    }

    /** Write `{ "preferences": { ... } }` with the empty store as `{}`. */
    private static function jsonPreferences(Response $response, array $prefs): Response
    {
        $response->getBody()->write(json_encode([
            'preferences' => $prefs === [] ? new \stdClass() : $prefs,
        ]));
        return $response->withHeader('Content-Type', 'application/json');
    }
}
