<?php
// backend/config/Database.php

class Database {
    private static ?PDO $instance = null;

    private static function config(): array {
        return [
            'host'    => env('DB_HOST') ?: '127.0.0.1',
            'dbname'  => env('DB_NAME') ?: '',
            'user'    => env('DB_USER') ?: '',
            'pass'    => env('DB_PASS') ?: '',
            'charset' => 'utf8mb4',
        ];
    }

    private function __construct() {}

    public static function getInstance(): PDO {
        if (self::$instance === null) {
            $cfg = self::config();
            $dsn = "mysql:host={$cfg['host']};dbname={$cfg['dbname']};charset={$cfg['charset']}";
            self::$instance = new PDO($dsn, $cfg['user'], $cfg['pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        }
        return self::$instance;
    }
}