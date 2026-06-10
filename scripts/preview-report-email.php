<?php

/**
 * Dev-only preview tool for the scheduled status-report email (CC32a).
 * Lives in scripts/ so it is excluded from the release package.
 *
 * Usage:
 *   php scripts/preview-report-email.php
 *       → renders a representative SAMPLE report to report-email-preview.html
 *         and report-email-preview.txt at the repo root. Open the .html in any
 *         browser (and drag it into different clients) to check layout.
 *
 *   php scripts/preview-report-email.php --to=you@example.com,other@example.com
 *       → ALSO sends the same email via the SMTP configured in api/.env, so you
 *         can inspect it in real mail apps (Gmail, Apple Mail, Outlook, …).
 *         Requires api/.env SMTP_* to be filled in (Mailer::isConfigured()).
 *
 * It is fully decoupled from the schedule/cron/recipients — it never touches the
 * database or report_schedule; it just renders the template and (optionally)
 * sends. Iterate on api/src/Services/ReportEmailRenderer.php and re-run.
 */

$root = dirname(__DIR__);
require $root . '/api/vendor/autoload.php';

use JamWork\Lib\Mailer;
use JamWork\Services\ReportEmailRenderer;

// --- Load api/.env into $_ENV (only needed for the --to send path) ----------
foreach (@file($root . '/api/.env') ?: [] as $line) {
    if (preg_match('/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/', $line, $m)) {
        $_ENV[$m[1]] = trim($m[2], " \t\"'");
    }
}

// --- Representative sample payload (mirrors ReportService's payload shape) ---
// Exercises every render branch: milestones, multiple projects, all status
// groups, overdue, assignees, unassigned, due dates, and subtasks.
$payload = [
    'generatedAt' => '2026-06-10T09:00:00+00:00',
    'copy' => [
        'noProjects' => 'No projects are included in the status report.',
        'noActiveTasks' => 'No active tasks.',
        'unassigned' => 'Unassigned',
    ],
    'milestones' => [
        ['name' => 'Beta launch', 'date' => '2026-06-20T00:00:00+00:00'],
        ['name' => 'Q3 planning complete', 'date' => '2026-07-01T00:00:00+00:00'],
    ],
    'projects' => [
        [
            'name' => 'Apollo',
            'groups' => [
                ['label' => 'In Progress', 'tasks' => [
                    ['title' => 'Wire up the billing webhook', 'overdue' => false,
                        'assignees' => [['name' => 'Claire Hollenbeck']], 'dueDate' => '2026-06-14T00:00:00+00:00',
                        'subtasks' => ['completed' => 2, 'total' => 5]],
                    ['title' => 'Migrate legacy invoices', 'overdue' => true,
                        'assignees' => [['name' => 'Doren Berge'], ['name' => 'Ivo']], 'dueDate' => '2026-06-05T00:00:00+00:00',
                        'subtasks' => null],
                ]],
                ['label' => 'Blocked', 'tasks' => [
                    ['title' => 'Awaiting tax-rate sign-off', 'overdue' => false,
                        'assignees' => [], 'dueDate' => null, 'subtasks' => null],
                ]],
                ['label' => 'Review', 'tasks' => [
                    ['title' => 'PR: refactor the report aggregator', 'overdue' => false,
                        'assignees' => [['name' => 'Amanda Dobbins']], 'dueDate' => '2026-06-12T00:00:00+00:00',
                        'subtasks' => ['completed' => 1, 'total' => 1]],
                ]],
                ['label' => 'Done', 'tasks' => [
                    ['title' => 'Ship scheduled-report dedup fix', 'overdue' => false,
                        'assignees' => [['name' => 'Doren Berge']], 'dueDate' => null, 'subtasks' => null],
                ]],
            ],
        ],
        [
            'name' => 'Gemini',
            'groups' => [],
        ],
    ],
];

$workspaceName = 'Alchemy K12';
// Prefer a prod-like URL for the preview link, even if local APP_URL is a dev host.
$previewBase = ($_ENV['APP_URL'] ?? '');
if ($previewBase === '' || str_contains($previewBase, 'localhost') || str_contains($previewBase, '127.0.0.1')) {
    $previewBase = 'https://jamwork.alchemyk12.com';
}
$reportUrl = $previewBase . '/reports/sample-preview';

$html = ReportEmailRenderer::render($payload, $workspaceName, $reportUrl);
$text = ReportEmailRenderer::renderText($payload, $workspaceName, $reportUrl);

$htmlPath = $root . '/report-email-preview.html';
$textPath = $root . '/report-email-preview.txt';
file_put_contents($htmlPath, $html);
file_put_contents($textPath, $text);

echo "Rendered:\n  $htmlPath\n  $textPath\n";
echo "Open the .html in a browser to preview the layout.\n";

// --- Optional: send to real inboxes -----------------------------------------
$to = null;
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--to=')) {
        $to = substr($arg, 5);
    }
}

if ($to === null) {
    echo "\n(No --to given; skipped sending. Add --to=you@example.com to send via api/.env SMTP.)\n";
    exit(0);
}

if (!Mailer::isConfigured()) {
    fwrite(STDERR, "\nERROR: SMTP is not configured in api/.env (SMTP_HOST/USER/PASS). Cannot send.\n");
    exit(1);
}

$mailer = new Mailer();
foreach (array_filter(array_map('trim', explode(',', $to))) as $address) {
    $result = $mailer->sendStatusReportEmail($address, $address, $html, $text, $workspaceName);
    echo $result['sent']
        ? "Sent to $address\n"
        : "FAILED to $address: " . ($result['error'] ?? 'unknown') . "\n";
}
