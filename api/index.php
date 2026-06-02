<?php

require __DIR__ . '/vendor/autoload.php';

date_default_timezone_set('UTC');

use Dotenv\Dotenv;
use JamWork\Bootstrap;

// Load environment variables
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();
$dotenv->required(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SECRET']);

Bootstrap::createApp()->run();
