<?php
/**
 * Приём заявок с сайта «Мастерская красоты»: онлайн-запись и обратный звонок.
 * Отправляет заявку в Telegram и/или на e-mail. Настройки — в config.php
 * (скопируйте config.example.php → config.php и заполните).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function reply(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    reply(500, ['ok' => false, 'error' => 'Не найден api/config.php — скопируйте config.example.php']);
}
$config = require $configFile;

$raw = file_get_contents('php://input', false, null, 0, 20000) ?: '';
$in = json_decode($raw, true);
if (!is_array($in)) {
    reply(400, ['ok' => false, 'error' => 'Bad request']);
}

// Защита от ботов: скрытое поле должно быть пустым
if (!empty($in['website'])) {
    reply(200, ['ok' => true]);
}

$clean = static function ($v, int $max = 300): string {
    $v = is_scalar($v) ? (string)$v : '';
    $v = trim(strip_tags($v));
    $v = preg_replace('/\s+/u', ' ', $v) ?? '';
    return mb_substr($v, 0, $max);
};

$type  = $in['type'] === 'booking' ? 'booking' : 'callback';
$name  = $clean($in['name'] ?? '', 80);
$phone = $clean($in['phone'] ?? '', 30);
$digits = preg_replace('/\D/', '', $phone) ?? '';
if (strlen($digits) !== 11) {
    reply(422, ['ok' => false, 'error' => 'Некорректный номер телефона']);
}

// Простое ограничение частоты: не больше 5 заявок с одного IP за 10 минут
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateDir = sys_get_temp_dir() . '/mk-rate';
@mkdir($rateDir, 0700, true);
$rateFile = $rateDir . '/' . md5($ip);
$now = time();
$hits = array_filter(
    is_file($rateFile) ? (array)json_decode((string)file_get_contents($rateFile), true) : [],
    static fn($t) => is_int($t) && $t > $now - 600
);
if (count($hits) >= 5) {
    reply(429, ['ok' => false, 'error' => 'Слишком много заявок, попробуйте позже']);
}
$hits[] = $now;
@file_put_contents($rateFile, json_encode(array_values($hits)));

if ($type === 'booking') {
    $title = '🗓 Онлайн-запись';
    $lines = [
        'Услуга: ' . $clean($in['service'] ?? '') . ' (' . $clean($in['category'] ?? '') . ')',
        'Дата: ' . $clean($in['date_human'] ?? $in['date'] ?? '') . ', ' . $clean($in['time'] ?? '', 10),
        'Стоимость: ' . $clean($in['price'] ?? '', 40) . ' · ' . $clean($in['duration'] ?? '', 40),
        'Имя: ' . $name,
        'Телефон: ' . $phone,
    ];
    $comment = $clean($in['comment'] ?? '', 1000);
    if ($comment !== '') $lines[] = 'Комментарий: ' . $comment;
} else {
    $title = '📞 Обратный звонок';
    $lines = [
        'Имя: ' . ($name !== '' ? $name : '—'),
        'Телефон: ' . $phone,
        'Когда звонить: ' . $clean($in['time'] ?? '', 60),
    ];
}
$lines[] = 'Страница: ' . $clean($in['page'] ?? '', 300);
$text = $title . "\n\n" . implode("\n", $lines);

$sent = false;

// Telegram
if (!empty($config['telegram_token']) && !empty($config['telegram_chat_id'])) {
    $url = 'https://api.telegram.org/bot' . $config['telegram_token'] . '/sendMessage';
    $ctx = stream_context_create(['http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/json\r\n",
        'content' => json_encode(['chat_id' => $config['telegram_chat_id'], 'text' => $text], JSON_UNESCAPED_UNICODE),
        'timeout' => 8,
    ]]);
    $res = @file_get_contents($url, false, $ctx);
    $sent = $res !== false && (json_decode($res, true)['ok'] ?? false);
}

// E-mail
if (!empty($config['email_to'])) {
    $subject = '=?UTF-8?B?' . base64_encode($title . ' — сайт «Мастерская красоты»') . '?=';
    $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    if (!empty($config['email_from'])) $headers .= 'From: ' . $config['email_from'] . "\r\n";
    $sent = @mail($config['email_to'], $subject, $text, $headers) || $sent;
}

// Резервный журнал заявок (на случай сбоя Telegram/почты)
if (!empty($config['log_file'])) {
    @file_put_contents($config['log_file'], date('c') . "\t" . str_replace("\n", ' | ', $text) . "\n", FILE_APPEND | LOCK_EX);
    $sent = true;
}

$sent
    ? reply(200, ['ok' => true])
    : reply(502, ['ok' => false, 'error' => 'Не удалось доставить заявку']);
