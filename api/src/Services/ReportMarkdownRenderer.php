<?php

namespace JamWork\Services;

/**
 * Renders a stored report payload to Markdown for download (CC30a). Uses
 * headings + lists only — never tables — so it pastes cleanly into Google Docs
 * / Notion. Overdue and blocked state is conveyed in text, never by formatting
 * alone. This is a pure projection of the payload: it walks projects, groups,
 * and tasks in the order given and never re-sorts or re-filters.
 */
class ReportMarkdownRenderer
{
    public static function render(array $payload): string
    {
        $lines = [];
        $horizon = $payload['milestoneHorizonDays'] ?? ReportService::DEFAULT_HORIZON_DAYS;
        $copy = $payload['copy'];

        $lines[] = '# Status Report — ' . self::date($payload['generatedAt'], 'F j, Y');
        $lines[] = '';

        // Scope note for project-filtered reports (CC36) — a blockquote below the
        // title. Full reports carry no scope block, so this is skipped entirely.
        if (!empty($payload['scope']['isFiltered'])) {
            $lines[] = '> ' . $payload['scope']['note'];
            $lines[] = '';
        }

        // Global milestone block (always rendered, with an honest empty state).
        $lines[] = "## Milestones (next {$horizon} days)";
        if (empty($payload['milestones'])) {
            $lines[] = $copy['noMilestones'];
        } else {
            foreach ($payload['milestones'] as $milestone) {
                $lines[] = '- ' . $milestone['name'] . ' — ' . self::date($milestone['date'], 'F j, Y');
            }
        }
        $lines[] = '';

        if (empty($payload['projects'])) {
            $lines[] = $copy['noProjects'];
            return self::finish($lines);
        }

        foreach ($payload['projects'] as $project) {
            $lines[] = '## ' . $project['name'];

            if (empty($project['groups'])) {
                $lines[] = $copy['noActiveTasks'];
                $lines[] = '';
                continue;
            }

            foreach ($project['groups'] as $group) {
                $lines[] = '### ' . $group['label'];
                foreach ($group['tasks'] as $task) {
                    $lines[] = self::taskLine($task, $copy['unassigned']);
                }
            }
            $lines[] = '';
        }

        return self::finish($lines);
    }

    private static function taskLine(array $task, string $unassignedLabel): string
    {
        $parts = [$task['title']];

        $names = array_map(fn($a) => $a['name'], $task['assignees'] ?? []);
        $parts[] = $names !== [] ? implode(', ', $names) : $unassignedLabel;

        if (!empty($task['dueDate'])) {
            $parts[] = 'due ' . self::date($task['dueDate'], 'M j, Y');
        }
        if (!empty($task['overdue'])) {
            $parts[] = 'OVERDUE';
        }
        if (!empty($task['subtasks'])) {
            $parts[] = 'subtasks ' . $task['subtasks']['completed'] . '/' . $task['subtasks']['total'];
        }

        return '- ' . implode(' — ', $parts);
    }

    private static function date(string $iso, string $format): string
    {
        return date($format, strtotime($iso));
    }

    /** @param string[] $lines */
    private static function finish(array $lines): string
    {
        return rtrim(implode("\n", $lines)) . "\n";
    }
}
