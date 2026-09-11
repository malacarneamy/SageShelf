<?php
// backend/models/UserModel.php

class UserModel {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function findByEmail(string $email): ?array {
        $stmt = $this->db->prepare(
            'SELECT id, username, email, avatar_url, created_at FROM users WHERE email = ?'
        );
        $stmt->execute([$email]);
        return $stmt->fetch() ?: null;
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare(
            'SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?'
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function findByUsername(string $username): ?array {
        $stmt = $this->db->prepare(
            'SELECT id, username, email, avatar_url, created_at FROM users WHERE username = ?'
        );
        $stmt->execute([$username]);
        return $stmt->fetch() ?: null;
    }

    /** Crea l'utente al primo login riuscito (verifyCode in AuthPresenter). */
    public function create(string $username, string $email): int {
        $stmt = $this->db->prepare(
            'INSERT INTO users (username, email) VALUES (?, ?)'
        );
        $stmt->execute([$username, $email]);
        return (int)$this->db->lastInsertId();
    }

    public function updateUsername(int $id, string $username): bool {
        $stmt = $this->db->prepare('UPDATE users SET username = ? WHERE id = ?');
        $stmt->execute([$username, $id]);
        return $stmt->rowCount() > 0;
    }

    public function updateAvatar(int $id, ?string $url): bool {
        $stmt = $this->db->prepare('UPDATE users SET avatar_url = ? WHERE id = ?');
        $stmt->execute([$url, $id]);
        return $stmt->rowCount() > 0;
    }

    public function delete(int $id): bool {
        $stmt = $this->db->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }

    public function getAllSortBy(int $userId): string {
        $stmt = $this->db->prepare('SELECT all_sort_by FROM user_preferences WHERE user_id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        return $row ? $row['all_sort_by'] : 'added_desc';
    }

    public function updateAllSortBy(int $userId, string $sortBy): bool {
        $stmt = $this->db->prepare('
            INSERT INTO user_preferences (user_id, all_sort_by) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE all_sort_by = VALUES(all_sort_by)
        ');
        $stmt->execute([$userId, $sortBy]);
        return true;
    }

    public function getAllShelfPosition(int $userId): int {
        $stmt = $this->db->prepare('SELECT all_shelf_position FROM user_preferences WHERE user_id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        return $row ? (int)$row['all_shelf_position'] : 0;
    }

    public function updateAllShelfPosition(int $userId, int $position): bool {
        $stmt = $this->db->prepare('
            INSERT INTO user_preferences (user_id, all_shelf_position) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE all_shelf_position = VALUES(all_shelf_position)
        ');
        $stmt->execute([$userId, $position]);
        return true;
    }
}