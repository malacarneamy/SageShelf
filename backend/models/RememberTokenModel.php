<?php
// backend/models/RememberTokenModel.php

class RememberTokenModel {
    private PDO $db;
    public const LIFETIME_DAYS = 30;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /** Crea un nuovo token per l'utente e ne restituisce il valore in chiaro (va nel cookie). */
    public function create(int $userId): string {
        $token     = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', time() + self::LIFETIME_DAYS * 86400);

        $stmt = $this->db->prepare(
            'INSERT INTO remember_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
        );
        $stmt->execute([$userId, $tokenHash, $expiresAt]);
        return $token;
    }

    /** Valida un token ricevuto dal cookie; restituisce lo user_id oppure null se non valido/scaduto. */
    public function findValidUserId(string $token): ?int {
        $tokenHash = hash('sha256', $token);
        $stmt = $this->db->prepare(
            'SELECT user_id FROM remember_tokens WHERE token_hash = ? AND expires_at > NOW()'
        );
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch();
        return $row ? (int)$row['user_id'] : null;
    }

    /** Elimina un singolo token (logout dal dispositivo corrente). */
    public function delete(string $token): void {
        $tokenHash = hash('sha256', $token);
        $stmt = $this->db->prepare('DELETE FROM remember_tokens WHERE token_hash = ?');
        $stmt->execute([$tokenHash]);
    }

    /** Rinnova la scadenza di un token valido ("finestra scorrevole"):
     *  ogni utilizzo sposta avanti di LIFETIME_DAYS la scadenza, così un
     *  utente attivo resta loggato indefinitamente e scade solo dopo
     *  LIFETIME_DAYS di inattività continua. */
    public function touch(string $token): void {
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', time() + self::LIFETIME_DAYS * 86400);
        $stmt = $this->db->prepare(
            'UPDATE remember_tokens SET expires_at = ? WHERE token_hash = ?'
        );
        $stmt->execute([$expiresAt, $tokenHash]);
    }

    /** Elimina tutti i token dell'utente (es. eliminazione account, logout ovunque). */
    public function deleteAllForUser(int $userId): void {
        $stmt = $this->db->prepare('DELETE FROM remember_tokens WHERE user_id = ?');
        $stmt->execute([$userId]);
    }
}
