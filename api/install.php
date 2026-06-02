<?php
/**
 * JamWork — Web-Based Installer
 *
 * Self-contained wizard that configures .env, runs migrations,
 * creates the admin user, and writes a lock file.
 * No Slim, no React, no external CDN.
 */

// ── Lock file guard ─────────────────────────────────────────
$lockFile = __DIR__ . '/.installed';
if (file_exists($lockFile)) {
    http_response_code(403);
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>JamWork</title></head>';
    echo '<body style="font-family:sans-serif;text-align:center;padding:80px 20px;">';
    echo '<h1>Already Installed</h1>';
    echo '<p>JamWork is already installed. Delete <code>api/.installed</code> to reinstall.</p>';
    echo '</body></html>';
    exit;
}

// ── Session ─────────────────────────────────────────────────
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? '1' : '0');
ini_set('session.use_strict_mode', '1');
session_start();

if (!isset($_SESSION['jamwork_install'])) {
    $_SESSION['jamwork_install'] = [];
}
if (!isset($_SESSION['jamwork_csrf'])) {
    $_SESSION['jamwork_csrf'] = bin2hex(random_bytes(32));
}

// ── CSRF helpers ────────────────────────────────────────────

function csrfField(): string {
    return '<input type="hidden" name="csrf_token" value="' . $_SESSION['jamwork_csrf'] . '">';
}

function validateCsrf(): bool {
    return isset($_POST['csrf_token']) && hash_equals($_SESSION['jamwork_csrf'], $_POST['csrf_token']);
}

// ── Utility functions ───────────────────────────────────────

function e(string $str): string {
    return htmlspecialchars(trim($str), ENT_QUOTES, 'UTF-8');
}

function sessionGet(string $key, $default = '') {
    return $_SESSION['jamwork_install'][$key] ?? $default;
}

function sessionSet(string $key, $value): void {
    $_SESSION['jamwork_install'][$key] = $value;
}

function stepComplete(int $step): bool {
    $required = [
        1 => 'env_checked',
        2 => 'db',
        3 => 'admin',
        4 => 'workspace',
        5 => 'smtp_done',
    ];
    for ($i = 1; $i <= $step; $i++) {
        if (!isset($_SESSION['jamwork_install'][$required[$i] ?? ''])) {
            return false;
        }
    }
    return true;
}

function earliestIncompleteStep(): int {
    for ($i = 1; $i <= 5; $i++) {
        if (!stepComplete($i)) return $i;
    }
    return 6;
}

function redirect(string $url): void {
    header('Location: ' . $url);
    exit;
}

function autoDetectAppUrl(): string {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $protocol . '://' . $host;
}

// ── HTML shell ──────────────────────────────────────────────

function renderHeader(string $title, int $step = -1): void {
    echo '<!DOCTYPE html>';
    echo '<html lang="en">';
    echo '<head>';
    echo '<meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>' . e($title) . ' — JamWork Installer</title>';
    echo '<link rel="stylesheet" href="/api/install-assets/install.css">';
    echo '</head>';
    echo '<body>';
    echo '<div class="installer-container">';

    if ($step >= 1 && $step <= 6) {
        renderStepProgress($step);
    }
}

function renderFooter(): void {
    // Focus management JS + password toggle
    echo '<script>';
    echo 'document.addEventListener("DOMContentLoaded",function(){';
    echo '  var h=document.querySelector("h2[tabindex]");if(h)h.focus();';
    echo '  document.querySelectorAll(".password-toggle").forEach(function(btn){';
    echo '    btn.addEventListener("click",function(){';
    echo '      var inp=this.previousElementSibling;';
    echo '      if(inp.type==="password"){inp.type="text";this.textContent="Hide";}';
    echo '      else{inp.type="password";this.textContent="Show";}';
    echo '    });';
    echo '  });';
    echo '});';
    echo '</script>';
    echo '</div></body></html>';
}

function renderStepProgress(int $current): void {
    $labels = [1 => 'Server', 2 => 'Database', 3 => 'Admin', 4 => 'Workspace', 5 => 'Email', 6 => 'Install'];
    echo '<div class="step-progress">';
    for ($i = 1; $i <= 6; $i++) {
        $class = 'step-item';
        if ($i < $current && stepComplete($i)) $class .= ' completed';
        elseif ($i === $current) $class .= ' active';

        // Completed steps are clickable
        if ($i < $current && stepComplete($i)) {
            echo '<a href="?step=' . $i . '" class="' . $class . '">';
        } else {
            echo '<span class="' . $class . '">';
        }

        echo '<span class="step-circle">';
        if ($i < $current && stepComplete($i)) {
            echo '&#10003;';
        } else {
            echo $i;
        }
        echo '</span>';

        if ($i < $current && stepComplete($i)) {
            echo '</a>';
        } else {
            echo '</span>';
        }

        if ($i < 6) {
            $connClass = 'step-connector';
            if ($i < $current) $connClass .= ' completed';
            echo '<span class="' . $connClass . '"></span>';
        }
    }
    echo '</div>';
}

// ── Step 0: Landing page ────────────────────────────────────

function renderStep0(): void {
    renderHeader('Welcome', -1);
    echo '<div class="text-center mb-24">';
    echo '<h1>JamWork</h1>';
    echo '<p class="subtitle">Lightweight task tracking for small teams</p>';
    echo '</div>';

    echo '<p>JamWork helps small product teams track tasks, manage sprints, and stay aligned &mdash; ';
    echo 'without the overhead of enterprise project management tools. ';
    echo 'This installer will set up your JamWork instance in a few minutes.</p>';

    echo '<div class="prereq-box">';
    echo '<h3>Before you begin</h3>';
    echo '<ul>';
    echo '<li>PHP 8.2 or higher</li>';
    echo '<li>MySQL 8.0 or higher</li>';
    echo '<li>An empty MySQL database with credentials ready</li>';
    echo '<li>(Optional) SMTP server credentials for email notifications</li>';
    echo '</ul>';
    echo '</div>';

    echo '<div class="text-center mt-24">';
    echo '<a href="?step=1" class="btn btn-primary">Begin Installation &rarr;</a>';
    echo '</div>';

    renderFooter();
}

// ── Step 1: Environment check ───────────────────────────────

function renderStep1(): void {
    renderHeader('Environment Check', 1);
    echo '<h2 tabindex="-1">Environment Check</h2>';
    echo '<p class="text-muted mb-16">Verifying your server meets the requirements.</p>';

    $checks = [];

    // PHP version
    $phpOk = PHP_VERSION_ID >= 80200;
    $checks[] = [
        'pass' => $phpOk,
        'label' => 'PHP ' . PHP_VERSION,
        'fail' => 'PHP ' . PHP_VERSION . ' detected. JamWork requires PHP 8.2 or higher.',
    ];

    // Extensions
    $extensions = ['pdo' => 'PDO', 'pdo_mysql' => 'PDO MySQL', 'mbstring' => 'mbstring', 'openssl' => 'OpenSSL', 'json' => 'JSON'];
    foreach ($extensions as $ext => $name) {
        $loaded = extension_loaded($ext);
        $checks[] = [
            'pass' => $loaded,
            'label' => $name . ' extension',
            'fail' => "The $name extension is not enabled. Contact your hosting provider.",
        ];
    }

    // Composer vendor
    $vendorOk = file_exists(__DIR__ . '/vendor/autoload.php');
    $checks[] = [
        'pass' => $vendorOk,
        'label' => 'Composer dependencies',
        'fail' => 'The vendor/ directory is missing or incomplete. Re-upload the complete JamWork package to your server. All files in the api/vendor/ folder are required.',
    ];

    // Writable
    $writableOk = is_writable(__DIR__);
    $checks[] = [
        'pass' => $writableOk,
        'label' => 'Directory writable (api/)',
        'fail' => 'The api/ directory is not writable. Set directory permissions to 755 or contact your hosting provider.',
    ];

    $allPass = true;
    echo '<ul class="check-list">';
    foreach ($checks as $c) {
        if (!$c['pass']) $allPass = false;
        echo '<li class="check-item">';
        echo '<span class="check-icon ' . ($c['pass'] ? 'check-pass' : 'check-fail') . '">';
        echo $c['pass'] ? '&#10003;' : '&#10007;';
        echo '</span>';
        echo '<span class="check-detail">';
        echo e($c['label']);
        if (!$c['pass']) {
            echo '<span class="fail-msg">' . e($c['fail']) . '</span>';
        }
        echo '</span>';
        echo '</li>';
    }
    echo '</ul>';

    if ($allPass) {
        sessionSet('env_checked', true);
    }

    echo '<div class="btn-row">';
    echo '<a href="?" class="btn btn-ghost">&larr; Back</a>';
    if ($allPass) {
        echo '<a href="?step=2" class="btn btn-primary">Continue &rarr;</a>';
    } else {
        echo '<span class="btn btn-primary disabled">Continue &rarr;</span>';
    }
    echo '</div>';

    renderFooter();
}

// ── Step 2: Database configuration ──────────────────────────

function renderStep2(array $errors = [], array $values = [], string $banner = ''): void {
    $db = sessionGet('db', []);
    $v = array_merge([
        'host' => $db['host'] ?? 'localhost',
        'port' => $db['port'] ?? '3306',
        'name' => $db['name'] ?? 'jamwork',
        'user' => $db['user'] ?? '',
        'pass' => '',
    ], $values);

    renderHeader('Database', 2);
    echo '<h2 tabindex="-1">Database Configuration</h2>';
    echo '<p class="text-muted mb-16">Enter your MySQL database credentials.</p>';

    if ($banner) {
        echo '<div class="alert alert-error">' . e($banner) . '</div>';
    }

    // Check if we need to show the "tables exist" warning
    if (isset($_GET['tables_warning'])) {
        $count = (int)($_GET['tables_warning']);
        echo '<div class="alert alert-warning">';
        echo 'This database already contains JamWork tables (' . $count . ' found). ';
        echo 'The installer will attempt to create tables using IF NOT EXISTS &mdash; existing data will be preserved, but this may cause conflicts.';
        echo '</div>';
        echo '<form method="post" action="?step=2&confirm_tables=1">';
        echo csrfField();
        // Re-pass the DB values
        echo '<input type="hidden" name="host" value="' . e($v['host']) . '">';
        echo '<input type="hidden" name="port" value="' . e($v['port']) . '">';
        echo '<input type="hidden" name="name" value="' . e($v['name']) . '">';
        echo '<input type="hidden" name="user" value="' . e($v['user']) . '">';
        echo '<input type="hidden" name="pass" value="' . e($v['pass']) . '">';
        echo '<div class="btn-row">';
        echo '<a href="?step=2" class="btn btn-ghost">&larr; Change Database</a>';
        echo '<button type="submit" class="btn btn-primary">Continue Anyway &rarr;</button>';
        echo '</div>';
        echo '</form>';
        renderFooter();
        return;
    }

    echo '<form method="post" action="?step=2">';
    echo csrfField();

    echo '<div class="form-group">';
    echo '<label for="host">Database Host</label>';
    echo '<input type="text" id="host" name="host" value="' . e($v['host']) . '" required' . (isset($errors['host']) ? ' class="error" aria-describedby="host-err"' : '') . '>';
    echo '<span class="help-text">On most shared hosts (SiteGround, Bluehost, etc.), use <code>localhost</code>. If your database is on a separate server, enter its hostname or IP address.</span>';
    if (isset($errors['host'])) echo '<span class="field-error" id="host-err">' . e($errors['host']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="port">Database Port</label>';
    echo '<input type="text" id="port" name="port" value="' . e($v['port']) . '" required' . (isset($errors['port']) ? ' class="error" aria-describedby="port-err"' : '') . '>';
    if (isset($errors['port'])) echo '<span class="field-error" id="port-err">' . e($errors['port']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="name">Database Name</label>';
    echo '<input type="text" id="name" name="name" value="' . e($v['name']) . '" required' . (isset($errors['name']) ? ' class="error" aria-describedby="name-err"' : '') . '>';
    if (isset($errors['name'])) echo '<span class="field-error" id="name-err">' . e($errors['name']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="user">Database User</label>';
    echo '<input type="text" id="user" name="user" value="' . e($v['user']) . '" required' . (isset($errors['user']) ? ' class="error" aria-describedby="user-err"' : '') . '>';
    if (isset($errors['user'])) echo '<span class="field-error" id="user-err">' . e($errors['user']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="pass">Database Password</label>';
    echo '<div class="password-wrapper">';
    echo '<input type="password" id="pass" name="pass" value="' . e($v['pass']) . '">';
    echo '<button type="button" class="password-toggle">Show</button>';
    echo '</div>';
    echo '</div>';

    echo '<div class="btn-row">';
    echo '<a href="?step=1" class="btn btn-ghost">&larr; Back</a>';
    echo '<button type="submit" class="btn btn-primary">Test Connection &amp; Continue &rarr;</button>';
    echo '</div>';

    echo '</form>';
    renderFooter();
}

function handleStep2Post(): void {
    if (!validateCsrf()) {
        renderStep2([], [], 'Invalid security token. Please try again.');
        return;
    }

    $values = [
        'host' => trim($_POST['host'] ?? ''),
        'port' => trim($_POST['port'] ?? '3306'),
        'name' => trim($_POST['name'] ?? ''),
        'user' => trim($_POST['user'] ?? ''),
        'pass' => $_POST['pass'] ?? '',
    ];

    $errors = [];
    if (empty($values['host'])) $errors['host'] = 'Host is required.';
    if (empty($values['port']) || !ctype_digit($values['port']) || (int)$values['port'] < 1 || (int)$values['port'] > 65535) {
        $errors['port'] = 'Port must be a number between 1 and 65535.';
    }
    if (empty($values['name'])) $errors['name'] = 'Database name is required.';
    if (empty($values['user'])) $errors['user'] = 'Username is required.';

    if (!empty($errors)) {
        renderStep2($errors, $values);
        return;
    }

    // Test connection
    try {
        $dsn = "mysql:host={$values['host']};port={$values['port']};dbname={$values['name']};charset=utf8mb4";
        $pdo = new PDO($dsn, $values['user'], $values['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5,
        ]);
    } catch (PDOException $ex) {
        renderStep2([], $values, 'Connection failed: ' . $ex->getMessage());
        return;
    }

    // If confirming tables warning, skip the check
    if (isset($_GET['confirm_tables'])) {
        sessionSet('db', $values);
        sessionSet('db_tables_exist', true);
        redirect('?step=3');
        return;
    }

    // Check for existing JamWork tables
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $jamworkTables = array_filter($tables, fn($t) => in_array($t, [
        'users', 'projects', 'tasks', 'sprints', 'milestones', 'subtasks',
        'labels', 'task_assignees', 'task_labels', 'task_links', 'workspace_settings', 'password_reset_tokens'
    ]));

    if (count($jamworkTables) > 0) {
        // Store values in session temporarily and show warning
        sessionSet('db', $values);
        redirect('?step=2&tables_warning=' . count($jamworkTables));
        return;
    }

    sessionSet('db', $values);
    redirect('?step=3');
}

// ── Step 3: Admin account ───────────────────────────────────

function renderStep3(array $errors = [], array $values = []): void {
    $admin = sessionGet('admin', []);
    $v = array_merge([
        'display_name' => $admin['display_name'] ?? '',
        'email' => $admin['email'] ?? '',
    ], $values);

    renderHeader('Admin Account', 3);
    echo '<h2 tabindex="-1">Admin Account</h2>';
    echo '<p class="text-muted mb-16">Create the first admin user.</p>';

    echo '<form method="post" action="?step=3">';
    echo csrfField();

    echo '<div class="form-group">';
    echo '<label for="display_name">Display Name</label>';
    echo '<input type="text" id="display_name" name="display_name" value="' . e($v['display_name']) . '" required' . (isset($errors['display_name']) ? ' class="error" aria-describedby="dn-err"' : '') . '>';
    if (isset($errors['display_name'])) echo '<span class="field-error" id="dn-err">' . e($errors['display_name']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="email">Email Address</label>';
    echo '<input type="email" id="email" name="email" value="' . e($v['email']) . '" required' . (isset($errors['email']) ? ' class="error" aria-describedby="email-err"' : '') . '>';
    echo '<span class="help-text">This will be your login email address.</span>';
    if (isset($errors['email'])) echo '<span class="field-error" id="email-err">' . e($errors['email']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="password">Password</label>';
    echo '<div class="password-wrapper">';
    echo '<input type="password" id="password" name="password" required' . (isset($errors['password']) ? ' class="error" aria-describedby="pw-err"' : '') . '>';
    echo '<button type="button" class="password-toggle">Show</button>';
    echo '</div>';
    if (isset($errors['password'])) echo '<span class="field-error" id="pw-err">' . e($errors['password']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="password_confirm">Confirm Password</label>';
    echo '<div class="password-wrapper">';
    echo '<input type="password" id="password_confirm" name="password_confirm" required' . (isset($errors['password_confirm']) ? ' class="error" aria-describedby="pwc-err"' : '') . '>';
    echo '<button type="button" class="password-toggle">Show</button>';
    echo '</div>';
    if (isset($errors['password_confirm'])) echo '<span class="field-error" id="pwc-err">' . e($errors['password_confirm']) . '</span>';
    echo '</div>';

    echo '<div class="btn-row">';
    echo '<a href="?step=2" class="btn btn-ghost">&larr; Back</a>';
    echo '<button type="submit" class="btn btn-primary">Continue &rarr;</button>';
    echo '</div>';

    echo '</form>';
    renderFooter();
}

function handleStep3Post(): void {
    if (!validateCsrf()) {
        renderStep3([], []);
        return;
    }

    $values = [
        'display_name' => trim($_POST['display_name'] ?? ''),
        'email' => trim($_POST['email'] ?? ''),
    ];
    $password = $_POST['password'] ?? '';
    $confirm = $_POST['password_confirm'] ?? '';

    $errors = [];
    if (empty($values['display_name'])) $errors['display_name'] = 'Display name is required.';
    if (strlen($values['display_name']) > 255) $errors['display_name'] = 'Display name must be 255 characters or fewer.';
    if (empty($values['email'])) $errors['email'] = 'Email is required.';
    elseif (!filter_var($values['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Enter a valid email address.';
    if (strlen($password) < 8) $errors['password'] = 'Password must be at least 8 characters.';
    if ($password !== $confirm) $errors['password_confirm'] = 'Passwords do not match.';

    if (!empty($errors)) {
        renderStep3($errors, $values);
        return;
    }

    sessionSet('admin', [
        'display_name' => $values['display_name'],
        'email' => $values['email'],
        'password' => $password,
    ]);
    redirect('?step=4');
}

// ── Step 4: Workspace setup ─────────────────────────────────

function renderStep4(array $errors = [], array $values = []): void {
    $ws = sessionGet('workspace', []);
    $v = array_merge([
        'name' => $ws['name'] ?? '',
        'app_url' => $ws['app_url'] ?? autoDetectAppUrl(),
    ], $values);

    renderHeader('Workspace', 4);
    echo '<h2 tabindex="-1">Workspace Setup</h2>';
    echo '<p class="text-muted mb-16">Name your workspace and confirm the application URL.</p>';

    echo '<form method="post" action="?step=4">';
    echo csrfField();

    echo '<div class="form-group">';
    echo '<label for="ws_name">Workspace Name</label>';
    echo '<input type="text" id="ws_name" name="ws_name" value="' . e($v['name']) . '" required' . (isset($errors['name']) ? ' class="error" aria-describedby="wsn-err"' : '') . '>';
    echo '<span class="help-text">This appears in emails and the app header. Example: &ldquo;Acme Team&rdquo;, &ldquo;Product Squad&rdquo;</span>';
    if (isset($errors['name'])) echo '<span class="field-error" id="wsn-err">' . e($errors['name']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="app_url">Application URL</label>';
    echo '<input type="url" id="app_url" name="app_url" value="' . e($v['app_url']) . '" required' . (isset($errors['app_url']) ? ' class="error" aria-describedby="url-err"' : '') . '>';
    echo '<span class="help-text">The URL where your team will access JamWork. This is used in email links. The auto-detected value is usually correct.</span>';
    if (isset($errors['app_url'])) echo '<span class="field-error" id="url-err">' . e($errors['app_url']) . '</span>';
    echo '</div>';

    echo '<div class="btn-row">';
    echo '<a href="?step=3" class="btn btn-ghost">&larr; Back</a>';
    echo '<button type="submit" class="btn btn-primary">Continue &rarr;</button>';
    echo '</div>';

    echo '</form>';
    renderFooter();
}

function handleStep4Post(): void {
    if (!validateCsrf()) {
        renderStep4([], []);
        return;
    }

    $values = [
        'name' => trim($_POST['ws_name'] ?? ''),
        'app_url' => trim($_POST['app_url'] ?? ''),
    ];

    $errors = [];
    if (empty($values['name'])) $errors['name'] = 'Workspace name is required.';
    if (strlen($values['name']) > 255) $errors['name'] = 'Workspace name must be 255 characters or fewer.';
    if (empty($values['app_url'])) $errors['app_url'] = 'Application URL is required.';
    elseif (!filter_var($values['app_url'], FILTER_VALIDATE_URL)) $errors['app_url'] = 'Enter a valid URL (e.g., https://tasks.example.com).';

    if (!empty($errors)) {
        renderStep4($errors, $values);
        return;
    }

    // Strip trailing slash
    $values['app_url'] = rtrim($values['app_url'], '/');

    sessionSet('workspace', $values);
    redirect('?step=5');
}

// ── Step 5: Email configuration (optional) ──────────────────

function renderStep5(array $errors = [], array $values = [], string $banner = ''): void {
    $smtp = sessionGet('smtp', []);
    $v = array_merge([
        'host' => $smtp['host'] ?? '',
        'port' => $smtp['port'] ?? '465',
        'user' => $smtp['user'] ?? '',
        'pass' => '',
        'from_email' => $smtp['from_email'] ?? '',
        'from_name' => $smtp['from_name'] ?? 'JamWork',
    ], $values);

    renderHeader('Email', 5);
    echo '<h2 tabindex="-1">Email Configuration</h2>';
    echo '<p class="text-muted">JamWork can send email notifications for team invitations, password resets, and task assignments. You can skip this step and configure email later by editing the <code>.env</code> file.</p>';

    echo '<div class="mb-16">';
    echo '<a href="?step=5&skip=1" class="btn btn-ghost">Skip &mdash; I\'ll set this up later &rarr;</a>';
    echo '</div>';

    if ($banner) {
        echo '<div class="alert alert-error">' . e($banner) . '</div>';
    }

    echo '<form method="post" action="?step=5">';
    echo csrfField();

    echo '<div class="form-group">';
    echo '<label for="smtp_host">SMTP Host</label>';
    echo '<input type="text" id="smtp_host" name="smtp_host" value="' . e($v['host']) . '" required' . (isset($errors['host']) ? ' class="error" aria-describedby="sh-err"' : '') . '>';
    if (isset($errors['host'])) echo '<span class="field-error" id="sh-err">' . e($errors['host']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="smtp_port">SMTP Port</label>';
    echo '<input type="text" id="smtp_port" name="smtp_port" value="' . e($v['port']) . '" required' . (isset($errors['port']) ? ' class="error" aria-describedby="sp-err"' : '') . '>';
    echo '<span class="help-text">Common ports: 465 (SSL) or 587 (STARTTLS)</span>';
    if (isset($errors['port'])) echo '<span class="field-error" id="sp-err">' . e($errors['port']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="smtp_user">SMTP Username</label>';
    echo '<input type="text" id="smtp_user" name="smtp_user" value="' . e($v['user']) . '" required' . (isset($errors['user']) ? ' class="error" aria-describedby="su-err"' : '') . '>';
    if (isset($errors['user'])) echo '<span class="field-error" id="su-err">' . e($errors['user']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="smtp_pass">SMTP Password</label>';
    echo '<div class="password-wrapper">';
    echo '<input type="password" id="smtp_pass" name="smtp_pass" value="' . e($v['pass']) . '" required' . (isset($errors['pass']) ? ' class="error" aria-describedby="sps-err"' : '') . '>';
    echo '<button type="button" class="password-toggle">Show</button>';
    echo '</div>';
    if (isset($errors['pass'])) echo '<span class="field-error" id="sps-err">' . e($errors['pass']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="smtp_from_email">From Email Address</label>';
    echo '<input type="email" id="smtp_from_email" name="smtp_from_email" value="' . e($v['from_email']) . '" required' . (isset($errors['from_email']) ? ' class="error" aria-describedby="sfe-err"' : '') . '>';
    if (isset($errors['from_email'])) echo '<span class="field-error" id="sfe-err">' . e($errors['from_email']) . '</span>';
    echo '</div>';

    echo '<div class="form-group">';
    echo '<label for="smtp_from_name">From Name</label>';
    echo '<input type="text" id="smtp_from_name" name="smtp_from_name" value="' . e($v['from_name']) . '">';
    echo '</div>';

    echo '<div class="btn-row">';
    echo '<a href="?step=4" class="btn btn-ghost">&larr; Back</a>';
    echo '<button type="submit" class="btn btn-primary">Test Connection &amp; Continue &rarr;</button>';
    echo '</div>';

    echo '</form>';
    renderFooter();
}

function handleStep5Post(): void {
    if (!validateCsrf()) {
        renderStep5([], [], 'Invalid security token. Please try again.');
        return;
    }

    $values = [
        'host' => trim($_POST['smtp_host'] ?? ''),
        'port' => trim($_POST['smtp_port'] ?? '465'),
        'user' => trim($_POST['smtp_user'] ?? ''),
        'pass' => $_POST['smtp_pass'] ?? '',
        'from_email' => trim($_POST['smtp_from_email'] ?? ''),
        'from_name' => trim($_POST['smtp_from_name'] ?? 'JamWork'),
    ];

    $errors = [];
    if (empty($values['host'])) $errors['host'] = 'SMTP host is required.';
    if (empty($values['port']) || !ctype_digit($values['port'])) $errors['port'] = 'Enter a valid port number.';
    if (empty($values['user'])) $errors['user'] = 'SMTP username is required.';
    if (empty($values['pass'])) $errors['pass'] = 'SMTP password is required.';
    if (empty($values['from_email'])) $errors['from_email'] = 'From email is required.';
    elseif (!filter_var($values['from_email'], FILTER_VALIDATE_EMAIL)) $errors['from_email'] = 'Enter a valid email address.';

    if (!empty($errors)) {
        renderStep5($errors, $values);
        return;
    }

    // Test SMTP connection via PHPMailer
    try {
        require_once __DIR__ . '/vendor/autoload.php';
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $values['host'];
        $mail->Port = (int) $values['port'];
        $mail->SMTPAuth = true;
        $mail->Username = $values['user'];
        $mail->Password = $values['pass'];
        $mail->SMTPSecure = ((int)$values['port'] === 587)
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS
            : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mail->Timeout = 10;
        $mail->smtpConnect();
        $mail->smtpClose();
    } catch (\Exception $ex) {
        $banner = 'SMTP connection failed: ' . $ex->getMessage();
        // Show error with option to skip
        renderHeader('Email', 5);
        echo '<h2 tabindex="-1">Email Configuration</h2>';
        echo '<div class="alert alert-error">' . e($banner) . '</div>';
        echo '<div class="btn-row">';
        echo '<a href="?step=5" class="btn btn-ghost">&larr; Try Again</a>';
        echo '<a href="?step=5&skip=1" class="btn btn-primary">Skip for Now &rarr;</a>';
        echo '</div>';
        renderFooter();
        return;
    }

    sessionSet('smtp', $values);
    sessionSet('smtp_done', true);
    redirect('?step=6');
}

// ── Step 6: Review & install ────────────────────────────────

function renderStep6(string $error = ''): void {
    $db = sessionGet('db', []);
    $admin = sessionGet('admin', []);
    $ws = sessionGet('workspace', []);
    $smtp = sessionGet('smtp', []);
    $smtpSkipped = sessionGet('smtp_skipped', false);

    renderHeader('Review', 6);
    echo '<h2 tabindex="-1">Review &amp; Install</h2>';
    echo '<p class="text-muted mb-16">Confirm your configuration before installing.</p>';

    if ($error) {
        echo '<div class="alert alert-error">' . e($error) . '</div>';
    }

    // Database
    echo '<div class="review-section">';
    echo '<div class="review-header"><h3>Database</h3><a href="?step=2" class="btn-link">Edit</a></div>';
    echo '<div class="review-grid">';
    echo '<span class="review-label">Host</span><span>' . e($db['host'] ?? '') . '</span>';
    echo '<span class="review-label">Port</span><span>' . e($db['port'] ?? '') . '</span>';
    echo '<span class="review-label">Database</span><span>' . e($db['name'] ?? '') . '</span>';
    echo '<span class="review-label">User</span><span>' . e($db['user'] ?? '') . '</span>';
    echo '<span class="review-label">Status</span><span class="check-pass">&#10003; Connection verified</span>';
    echo '</div></div>';

    // Admin
    echo '<div class="review-section">';
    echo '<div class="review-header"><h3>Admin Account</h3><a href="?step=3" class="btn-link">Edit</a></div>';
    echo '<div class="review-grid">';
    echo '<span class="review-label">Name</span><span>' . e($admin['display_name'] ?? '') . '</span>';
    echo '<span class="review-label">Email</span><span>' . e($admin['email'] ?? '') . '</span>';
    echo '</div></div>';

    // Workspace
    echo '<div class="review-section">';
    echo '<div class="review-header"><h3>Workspace</h3><a href="?step=4" class="btn-link">Edit</a></div>';
    echo '<div class="review-grid">';
    echo '<span class="review-label">Name</span><span>' . e($ws['name'] ?? '') . '</span>';
    echo '<span class="review-label">URL</span><span>' . e($ws['app_url'] ?? '') . '</span>';
    echo '</div></div>';

    // Email
    echo '<div class="review-section">';
    echo '<div class="review-header"><h3>Email</h3><a href="?step=5" class="btn-link">Edit</a></div>';
    echo '<div class="review-grid">';
    if ($smtpSkipped || empty($smtp['host'])) {
        echo '<span class="review-label">Status</span><span class="text-muted">&#9197; Not configured (can be added later)</span>';
    } else {
        echo '<span class="review-label">SMTP</span><span>' . e($smtp['host'] . ':' . $smtp['port']) . '</span>';
        echo '<span class="review-label">From</span><span>' . e($smtp['from_email'] . ' (' . ($smtp['from_name'] ?: 'JamWork') . ')') . '</span>';
        echo '<span class="review-label">Status</span><span class="check-pass">&#10003; Connection verified</span>';
    }
    echo '</div></div>';

    echo '<form method="post" action="?step=6">';
    echo csrfField();
    echo '<div class="btn-row">';
    echo '<a href="?step=5" class="btn btn-ghost">&larr; Back</a>';
    echo '<button type="submit" class="btn btn-teal">Install JamWork</button>';
    echo '</div>';
    echo '</form>';

    renderFooter();
}

function executeInstall(): void {
    if (!validateCsrf()) {
        renderStep6('Invalid security token. Please try again.');
        return;
    }

    $db = sessionGet('db', []);
    $admin = sessionGet('admin', []);
    $ws = sessionGet('workspace', []);
    $smtp = sessionGet('smtp', []);
    $smtpSkipped = sessionGet('smtp_skipped', false);
    $envWritten = false;

    try {
        // 1. Generate JWT secret
        $jwtSecret = bin2hex(random_bytes(32));

        // 2. Write .env
        $timestamp = gmdate('Y-m-d H:i:s T');
        $smtpHost = $smtpSkipped ? '' : ($smtp['host'] ?? '');
        $smtpPort = $smtpSkipped ? '465' : ($smtp['port'] ?? '465');
        $smtpUser = $smtpSkipped ? '' : ($smtp['user'] ?? '');
        $smtpPass = $smtpSkipped ? '' : ($smtp['pass'] ?? '');
        $smtpFromEmail = $smtpSkipped ? '' : ($smtp['from_email'] ?? '');
        $smtpFromName = $smtpSkipped ? 'JamWork' : ($smtp['from_name'] ?? 'JamWork');

        $envContent = <<<ENV
# Generated by JamWork Installer on {$timestamp}
# WARNING: Contains sensitive credentials. Do not commit to version control.

# ── Database ───────────────────────────────────────────────
DB_HOST={$db['host']}
DB_NAME={$db['name']}
DB_USER={$db['user']}
DB_PASS={$db['pass']}
DB_PORT={$db['port']}

# ── Authentication ─────────────────────────────────────────
JWT_SECRET={$jwtSecret}
JWT_EXPIRY=30d

# ── Email (SMTP) ──────────────────────────────────────────
SMTP_HOST={$smtpHost}
SMTP_PORT={$smtpPort}
SMTP_USER={$smtpUser}
SMTP_PASS={$smtpPass}
SMTP_FROM_EMAIL={$smtpFromEmail}
SMTP_FROM_NAME={$smtpFromName}

# ── Application ────────────────────────────────────────────
APP_URL={$ws['app_url']}
APP_ENV=production
ENV;

        $wrote = file_put_contents(__DIR__ . '/.env', $envContent, LOCK_EX);
        if ($wrote === false) {
            throw new \RuntimeException('Failed to write .env file. Check directory permissions.');
        }
        $envWritten = true;

        // 3. Run migrations
        $dsn = "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset=utf8mb4";
        $pdo = new PDO($dsn, $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);

        $migrations = [
            __DIR__ . '/migrations/001_initial_schema.sql',
            __DIR__ . '/migrations/002_password_reset_tokens.sql',
            __DIR__ . '/migrations/003_project_sprint_planning.sql',
            __DIR__ . '/migrations/004_notification_preferences.sql',
            __DIR__ . '/migrations/005_add_token_version.sql',
        ];

        foreach ($migrations as $file) {
            $sql = file_get_contents($file);
            if ($sql === false) {
                throw new \RuntimeException('Cannot read migration file: ' . basename($file));
            }
            $pdo->exec($sql);
        }

        // 4. Create admin user
        require_once __DIR__ . '/vendor/autoload.php';

        $userId = \Ramsey\Uuid\Uuid::uuid4()->toString();
        $passwordHash = password_hash($admin['password'], PASSWORD_BCRYPT, ['cost' => 12]);

        $stmt = $pdo->prepare(
            "INSERT INTO users (id, email, password_hash, display_name, role, must_reset_password)
             VALUES (?, ?, ?, ?, 'admin', 0)"
        );
        $stmt->execute([$userId, $admin['email'], $passwordHash, $admin['display_name']]);

        // 5. Set workspace name
        $settingId = \Ramsey\Uuid\Uuid::uuid4()->toString();
        $stmt = $pdo->prepare(
            "INSERT INTO workspace_settings (id, `key`, value) VALUES (?, 'workspace_name', ?)"
        );
        $stmt->execute([$settingId, $ws['name']]);

        // 6. Write lock file
        $lockContent = "# JamWork Installation Lock\n"
            . "# This file prevents the installer from running again.\n"
            . "# Delete this file ONLY if you need to reinstall.\n"
            . "installed_at=" . gmdate('c') . "\n"
            . "installer_version=1.0\n";
        file_put_contents(__DIR__ . '/.installed', $lockContent, LOCK_EX);

        // 7. Destroy session
        $_SESSION = [];
        session_destroy();

        // 8. Success page
        renderSuccessPage($ws['app_url'], $smtpSkipped);

    } catch (\Exception $ex) {
        $msg = 'Installation failed: ' . $ex->getMessage();
        if ($envWritten) {
            $msg .= ' A partial .env file was written. You may need to delete it before retrying.';
        }
        renderStep6($msg);
    }
}

function renderSuccessPage(string $appUrl, bool $smtpSkipped): void {
    renderHeader('Complete', -1);
    echo '<div class="text-center mb-24">';
    echo '<h1>Installation Complete</h1>';
    echo '<p class="subtitle">JamWork is installed and ready to use.</p>';
    echo '</div>';

    echo '<div class="prereq-box">';
    echo '<h3>Next Steps</h3>';
    echo '<ul>';
    echo '<li>Log in with the admin account you just created</li>';
    echo '<li>Invite your team from the admin panel</li>';
    if ($smtpSkipped) {
        echo '<li>To enable email notifications, edit the SMTP settings in <code>api/.env</code></li>';
    }
    echo '</ul>';
    echo '</div>';

    echo '<div class="text-center mt-24">';
    echo '<a href="' . e($appUrl) . '" class="btn btn-teal">Go to JamWork &rarr;</a>';
    echo '</div>';

    renderFooter();
}

// ── Main router ─────────────────────────────────────────────

$method = $_SERVER['REQUEST_METHOD'];
$step = isset($_GET['step']) ? (int) $_GET['step'] : -1;

// Handle step 5 skip (GET with skip param)
if ($step === 5 && isset($_GET['skip'])) {
    sessionSet('smtp', []);
    sessionSet('smtp_skipped', true);
    sessionSet('smtp_done', true);
    redirect('?step=6');
}

// Step enforcement: can't jump ahead
if ($step >= 2 && !stepComplete($step - 1)) {
    redirect('?step=' . earliestIncompleteStep());
}

if ($method === 'POST') {
    switch ($step) {
        case 2: handleStep2Post(); break;
        case 3: handleStep3Post(); break;
        case 4: handleStep4Post(); break;
        case 5: handleStep5Post(); break;
        case 6: executeInstall(); break;
        default: redirect('?'); break;
    }
} else {
    switch ($step) {
        case 1: renderStep1(); break;
        case 2: renderStep2(); break;
        case 3: renderStep3(); break;
        case 4: renderStep4(); break;
        case 5: renderStep5(); break;
        case 6:
            if (!stepComplete(5)) {
                redirect('?step=' . earliestIncompleteStep());
            }
            renderStep6();
            break;
        default: renderStep0(); break;
    }
}
