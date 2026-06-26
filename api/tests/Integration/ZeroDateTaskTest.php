<?php

namespace Tests\Integration;

/**
 * Regression for the production incident (CC43): a task whose due_date holds a
 * MySQL zero-date ('0000-00-00 00:00:00') must serialize to dueDate: null. The
 * old code emitted '-001-11-30T...' (year -001), an invalid JS Date that threw
 * RangeError in the client list render and took down the whole page.
 */
final class ZeroDateTaskTest extends IntegrationTestCase
{
    public function testZeroDateDueDateSerializesToNull(): void
    {
        $user = $this->seedUser();
        $token = $this->tokenFor($user);
        $projectId = $this->seedProject($user['id']);

        // MySQL 8 rejects zero-dates under the default strict sql_mode, so relax
        // it just long enough to plant the bad row the way prod ended up with one.
        $original = $this->db->query('SELECT @@SESSION.sql_mode')->fetchColumn();
        $this->db->exec("SET SESSION sql_mode=''");
        $taskId = $this->seedTask($projectId, $user['id'], [
            'title' => 'Zero date task',
            'due_date' => '0000-00-00 00:00:00',
        ]);
        $this->db->exec('SET SESSION sql_mode=' . $this->db->quote($original));

        $body = $this->decode($this->request('GET', '/tasks', null, $token));
        $task = null;
        foreach ($body['tasks'] as $t) {
            if ($t['id'] === $taskId) {
                $task = $t;
                break;
            }
        }

        $this->assertNotNull($task, 'seeded task is present in the list');
        $this->assertNull($task['dueDate'], 'zero-date due_date serializes to null, not garbage');
    }
}
