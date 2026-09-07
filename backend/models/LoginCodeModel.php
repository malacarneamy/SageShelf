<?php
// backend/models/LoginCodeModel.php

class LoginCodeModel {

    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /** Quanti secondi deve aspettare un'email prima di poter richiedere un nuovo codice. */
    public const RATE_LIMIT_SECONDS = 60;

    /** Dopo quanti minuti scade un codice. */
    public const EXPIRY_MINUTES = 10;

    /** Numero massimo di tentativi di verifica prima di invalidare il codice. */
    public const MAX_ATTEMPTS = 5;

    public function create(string $email, string $codeHash): int {
        $stmt = $this->db->prepare(
            "INSERT INTO login_codes (email, code_hash, expires_at)
             VALUES (:email, :code_hash, DATE_ADD(NOW(), INTERVAL :minutes MINUTE))"
        );
        $stmt->bindValue(':email', $email);
        $stmt->bindValue(':code_hash', $codeHash);
        $stmt->bindValue(':minutes', self::EXPIRY_MINUTES, PDO::PARAM_INT);
        $stmt->execute();
        return (int)$this->db->lastInsertId();
    }

    /** Restituisce l'ultimo codice valido (non usato, non scaduto) per un'email. */
    public function findLatestValidByEmail(string $email): ?array {
        $stmt = $this->db->prepare(
            "SELECT * FROM login_codes
             WHERE email = ? AND used_at IS NULL AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1"
        );
        $stmt->execute([$email]);
        return $stmt->fetch() ?: null;
    }

    /** Controlla se è stato richiesto un codice troppo di recente (rate limiting). */
    public function wasRequestedRecently(string $email): bool {
        $stmt = $this->db->prepare(
            "SELECT 1 FROM login_codes
             WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
             LIMIT 1"
        );
        $stmt->bindValue(1, $email);
        $stmt->bindValue(2, self::RATE_LIMIT_SECONDS, PDO::PARAM_INT);
        $stmt->execute();
        return (bool)$stmt->fetchColumn();
    }

    public function incrementAttempts(int $id): void {
        $stmt = $this->db->prepare(
            "UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?"
        );
        $stmt->execute([$id]);
    }

    public function markUsed(int $id): void {
        $stmt = $this->db->prepare(
            "UPDATE login_codes SET used_at = NOW() WHERE id = ?"
        );
        $stmt->execute([$id]);
    }

    /** Da chiamare periodicamente (es. cron) per pulire i codici scaduti. */
    public function deleteExpired(): void {
        $this->db->exec("DELETE FROM login_codes WHERE expires_at < NOW()");
    }
}