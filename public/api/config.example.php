<?php
/**
 * Скопируйте этот файл в config.php и заполните.
 *
 * Telegram: создайте бота у @BotFather (получите token), добавьте бота в чат
 * администраторов и узнайте chat_id (например, через @getmyid_bot или getUpdates).
 */
return [
    'telegram_token'   => '',            // '123456789:AA...'
    'telegram_chat_id' => '',            // '-1001234567890' или ваш id
    'email_to'         => '',            // 'admin@example.ru' — копия заявок на почту
    'email_from'       => '',            // 'site@ваш-домен.ru'
    'log_file'         => __DIR__ . '/../../leads.log', // резервный журнал вне публичной папки; '' чтобы отключить
];
