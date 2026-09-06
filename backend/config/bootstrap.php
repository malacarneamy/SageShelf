<?php
// backend/config/bootstrap.php

define('BASE_PATH', dirname(__DIR__));

// ── .env loader ──────────────────
$envFile = BASE_PATH . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#')) continue;
        [$key, $value] = array_pad(explode('=', $line, 2), 2, '');
        $key = trim($key);
        $value = trim($value);
        if ($key !== '' && getenv($key) === false) {
            putenv("$key=$value");
        }
    }
}

// ── Autoload ────────────────────────────────────────────────
spl_autoload_register(function (string $class): void {
    $dirs = ['config', 'models', 'presenters', 'views', 'middleware'];
    foreach ($dirs as $dir) {
        $file = BASE_PATH . "/{$dir}/{$class}.php";
        if (file_exists($file)) { require_once $file; return; }
    }
});

// ── Cloudinary ───────────────────────────────────────────────
define('CLOUDINARY_CLOUD_NAME', getenv('CLOUDINARY_CLOUD_NAME') ?: '');
define('CLOUDINARY_API_KEY',    getenv('CLOUDINARY_API_KEY') ?: '');
define('CLOUDINARY_API_SECRET', getenv('CLOUDINARY_API_SECRET') ?: '');

// ── Mail (per invio codici OTP, via Resend API) ───────────────
define('MAIL_FROM',      getenv('MAIL_FROM') ?: 'onboarding@resend.dev');
define('MAIL_FROM_NAME', getenv('MAIL_FROM_NAME') ?: 'SageShelf');
define('MAIL_API_KEY',   getenv('MAIL_API_KEY') ?: '');

// ── Session ─────────────────────────────────────────────────
const SESSION_LIFETIME = 60 * 60 * 24 * 30; // 30 giorni in secondi

// session.gc_maxlifetime deve essere allineato alla lifetime del cookie
ini_set('session.gc_maxlifetime', (string)SESSION_LIFETIME);

session_set_cookie_params([
    'lifetime' => SESSION_LIFETIME,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// ── CORS ─────────────────────────────────────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_filter(explode(',', getenv('CORS_ALLOWED_ORIGINS') ?: 'https://sageshelf.great-site.net'));
if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Helpers ──────────────────────────────────────────────────
function respond(mixed $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode(['success' => $code < 400, 'data' => $data]);
    exit;
}

function respondError(string $message, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function getBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

function requireAuth(): int {
    if (empty($_SESSION['user_id'])) respondError('Unauthorized', 401);

    if (isset($_COOKIE[session_name()])) {
        setcookie(session_name(), $_COOKIE[session_name()], [
            'expires'  => time() + SESSION_LIFETIME,
            'path'     => '/',
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    return (int)$_SESSION['user_id'];
}

// ── HTTP helper (cURL) ───────────────────────────────────────
function httpGet(string $url): ?string {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'SageShelf/1.0');
    $result = curl_exec($ch);
    curl_close($ch);
    return $result ?: null;
}

// ── Email helper (per invio codici OTP, via Resend API) ───────
function sendEmail(string $to, string $subject, string $body): bool {
    if (MAIL_API_KEY === '') {
        error_log('sendEmail: MAIL_API_KEY non configurata in .env');
        return false;
    }

    $payload = json_encode([
        'from'    => MAIL_FROM_NAME . ' <' . MAIL_FROM . '>',
        'to'      => [$to],
        'subject' => $subject,
        'text'    => $body,
    ]);

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . MAIL_API_KEY,
        'Content-Type: application/json',
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr !== '') {
        error_log('sendEmail cURL error: ' . $curlErr);
        return false;
    }
    if ($httpCode < 200 || $httpCode >= 300) {
        error_log('sendEmail Resend error (' . $httpCode . '): ' . $response);
        return false;
    }
    return true;
}