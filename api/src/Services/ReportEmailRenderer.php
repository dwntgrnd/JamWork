<?php

namespace JamWork\Services;

/**
 * Renders a stored report payload to an HTML email body (CC32a) and a plain-text
 * AltBody. Analogous to {@see ReportMarkdownRenderer} but for email: inline
 * styles only (clients strip <style>/external CSS), single-column table layout,
 * max-width 600px, matching the existing email palette (invite.html). Like the
 * markdown renderer this is a pure projection of the payload — it walks projects,
 * groups, and tasks in the order given and never re-sorts or re-filters. Every
 * interpolated value is HTML-escaped in the HTML output (blind-rendering of the
 * payload, Decision #80).
 */
class ReportEmailRenderer
{
    // Palette (mirrors api/src/Mail/templates/*.html).
    private const BG = '#f4f4f5';
    private const CARD = '#ffffff';
    private const HEADING = '#18181b';
    private const BODY = '#3f3f46';
    private const MUTED = '#71717a';
    private const FAINT = '#a1a1aa';
    private const OVERDUE = '#dc2626';
    private const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    /** Build the full HTML email body. */
    public static function render(array $payload, string $workspaceName, string $reportUrl): string
    {
        $copy = $payload['copy'];
        $ws = self::esc($workspaceName);
        $generated = self::date($payload['generatedAt'], 'F j, Y');

        $inner = '';

        // Header + subheader + CTA.
        $inner .= '<tr><td style="padding: 32px 32px 8px;">'
            . '<h1 style="margin: 0; font-size: 20px; font-weight: 600; color: ' . self::HEADING . ';">'
            . 'Status Report — ' . $ws . '</h1>'
            . '<p style="margin: 8px 0 0; font-size: 13px; color: ' . self::MUTED . ';">Generated ' . $generated . '</p>'
            . '</td></tr>';

        $inner .= '<tr><td style="padding: 16px 32px 8px;">'
            . '<a href="' . self::esc($reportUrl) . '" style="font-size: 14px; color: ' . self::HEADING . '; font-weight: 500; text-decoration: none;">'
            . 'View this report in JamWork &rarr;</a></td></tr>';

        // Milestones (only when present).
        if (!empty($payload['milestones'])) {
            $items = '';
            foreach ($payload['milestones'] as $m) {
                $items .= '<li style="margin: 0 0 6px;">' . self::esc($m['name'])
                    . ' <span style="color: ' . self::MUTED . ';">— ' . self::date($m['date'], 'F j, Y') . '</span></li>';
            }
            $inner .= self::sectionHeading('Milestones')
                . '<tr><td style="padding: 0 32px 8px;">'
                . '<ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: ' . self::BODY . ';">'
                . $items . '</ul></td></tr>';
        }

        // Projects.
        if (empty($payload['projects'])) {
            $inner .= '<tr><td style="padding: 16px 32px; font-size: 14px; color: ' . self::BODY . ';">'
                . self::esc($copy['noProjects']) . '</td></tr>';
        } else {
            foreach ($payload['projects'] as $project) {
                $inner .= self::projectBlock($project, $copy);
            }
        }

        // Footer.
        $inner .= '<tr><td style="padding: 24px 32px 32px; border-top: 1px solid ' . self::BG . ';">'
            . '<p style="margin: 0; font-size: 13px; line-height: 1.5; color: ' . self::FAINT . ';">'
            . 'To change your report preferences, ask your workspace admin.</p></td></tr>';

        return self::shell($inner, $ws);
    }

    /** Build the plain-text AltBody — same content, flat text, no HTML. */
    public static function renderText(array $payload, string $workspaceName, string $reportUrl): string
    {
        $copy = $payload['copy'];
        $lines = [];
        $lines[] = 'Status Report — ' . $workspaceName;
        $lines[] = 'Generated ' . self::date($payload['generatedAt'], 'F j, Y');
        $lines[] = '';
        $lines[] = 'View this report in JamWork: ' . $reportUrl;
        $lines[] = '';

        if (!empty($payload['milestones'])) {
            $lines[] = 'Milestones';
            foreach ($payload['milestones'] as $m) {
                $lines[] = '- ' . $m['name'] . ' — ' . self::date($m['date'], 'F j, Y');
            }
            $lines[] = '';
        }

        if (empty($payload['projects'])) {
            $lines[] = $copy['noProjects'];
        } else {
            foreach ($payload['projects'] as $project) {
                $lines[] = $project['name'];
                if (empty($project['groups'])) {
                    $lines[] = '  ' . $copy['noActiveTasks'];
                    $lines[] = '';
                    continue;
                }
                foreach ($project['groups'] as $group) {
                    $lines[] = '  ' . $group['label'];
                    foreach ($group['tasks'] as $task) {
                        $lines[] = '    - ' . self::taskText($task, $copy['unassigned']);
                    }
                }
                $lines[] = '';
            }
        }

        $lines[] = 'To change your report preferences, ask your workspace admin.';

        return rtrim(implode("\n", $lines)) . "\n";
    }

    // --- HTML helpers -------------------------------------------------------

    private static function projectBlock(array $project, array $copy): string
    {
        $out = '<tr><td style="padding: 20px 32px 4px;">'
            . '<h2 style="margin: 0; font-size: 16px; font-weight: 600; color: ' . self::HEADING . ';">'
            . self::esc($project['name']) . '</h2></td></tr>';

        if (empty($project['groups'])) {
            return $out . '<tr><td style="padding: 4px 32px 8px; font-size: 14px; color: ' . self::MUTED . ';">'
                . self::esc($copy['noActiveTasks']) . '</td></tr>';
        }

        foreach ($project['groups'] as $group) {
            $out .= '<tr><td style="padding: 12px 32px 4px;">'
                . '<span style="display: inline-block; font-size: 12px; font-weight: 600; text-transform: uppercase; '
                . 'letter-spacing: 0.04em; color: ' . self::MUTED . ';">' . self::esc($group['label']) . '</span></td></tr>';

            $rows = '';
            foreach ($group['tasks'] as $task) {
                $rows .= self::taskRow($task, $copy['unassigned']);
            }
            $out .= '<tr><td style="padding: 0 32px 8px;">'
                . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">'
                . $rows . '</table></td></tr>';
        }

        return $out;
    }

    private static function taskRow(array $task, string $unassignedLabel): string
    {
        $title = self::esc($task['title']);
        if (!empty($task['overdue'])) {
            $title .= ' <span style="color: ' . self::OVERDUE . '; font-weight: 600;">Overdue</span>';
        }

        $names = array_map(fn($a) => $a['name'], $task['assignees'] ?? []);
        $meta = [$names !== [] ? self::esc(implode(', ', $names)) : self::esc($unassignedLabel)];
        if (!empty($task['dueDate'])) {
            $meta[] = 'due ' . self::date($task['dueDate'], 'M j, Y');
        }
        if (!empty($task['subtasks'])) {
            $meta[] = 'subtasks ' . (int) $task['subtasks']['completed'] . '/' . (int) $task['subtasks']['total'];
        }

        return '<tr><td style="padding: 4px 0; font-size: 14px; line-height: 1.5; color: ' . self::BODY . ';">'
            . $title
            . '<br><span style="font-size: 13px; color: ' . self::MUTED . ';">' . implode(' · ', $meta) . '</span>'
            . '</td></tr>';
    }

    /** Wrap inner rows in the outer card + page table. */
    private static function shell(string $inner, string $escapedWorkspace): string
    {
        return '<!DOCTYPE html><html lang="en"><head>'
            . '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
            . '<title>Status Report — ' . $escapedWorkspace . '</title></head>'
            . '<body style="margin: 0; padding: 0; background-color: ' . self::BG . '; font-family: ' . self::FONT . ';">'
            . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ' . self::BG . ';">'
            . '<tr><td style="padding: 40px 20px;">'
            . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: ' . self::CARD . '; border-radius: 8px; overflow: hidden;">'
            . $inner
            . '</table></td></tr></table></body></html>';
    }

    private static function sectionHeading(string $label): string
    {
        return '<tr><td style="padding: 20px 32px 4px;">'
            . '<h2 style="margin: 0; font-size: 16px; font-weight: 600; color: ' . self::HEADING . ';">'
            . self::esc($label) . '</h2></td></tr>';
    }

    private static function taskText(array $task, string $unassignedLabel): string
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
            $parts[] = 'subtasks ' . (int) $task['subtasks']['completed'] . '/' . (int) $task['subtasks']['total'];
        }
        return implode(' — ', $parts);
    }

    private static function date(string $iso, string $format): string
    {
        return date($format, strtotime($iso));
    }

    private static function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }
}
