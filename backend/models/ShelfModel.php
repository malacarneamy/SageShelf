<?php
// backend/models/ShelfModel.php

class ShelfModel {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function getAll(int $userId): array {
        $stmt = $this->db->prepare(
            'SELECT s.*,
                    COUNT(ub.id)                                          AS total,
                    SUM(ub.status = "want_to_read")                       AS want_to_read,
                    SUM(ub.status = "reading")                            AS reading,
                    SUM(ub.status = "read")                               AS read_count
             FROM shelves s
             LEFT JOIN user_books ub ON ub.shelf_id = s.id AND ub.user_id = s.user_id
             WHERE s.user_id = ?
             GROUP BY s.id
             ORDER BY s.position ASC, s.created_at ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public function findById(int $id, int $userId): ?array {
        $stmt = $this->db->prepare('SELECT * FROM shelves WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public function create(int $userId, string $name): int {
        // posizione = ultimo + 1
        $pos = $this->db->prepare('SELECT COALESCE(MAX(position),0)+1 FROM shelves WHERE user_id = ?');
        $pos->execute([$userId]);
        $position = (int)$pos->fetchColumn();

        $stmt = $this->db->prepare(
            'INSERT INTO shelves (user_id, name, position) VALUES (?, ?, ?)'
        );
        $stmt->execute([$userId, $name, $position]);
        return (int)$this->db->lastInsertId();
    }

    public function update(int $id, int $userId, string $name): bool {
        $stmt = $this->db->prepare('UPDATE shelves SET name = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([$name, $id, $userId]);
        return $stmt->rowCount() > 0;
    }

    public function delete(int $id, int $userId): bool {
        $stmt = $this->db->prepare('DELETE FROM shelves WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    }

    public function reorder(int $userId, array $orderedIds): void {
        $stmt = $this->db->prepare('UPDATE shelves SET position = ? WHERE id = ? AND user_id = ?');
        foreach ($orderedIds as $pos => $id) {
            $stmt->execute([$pos, $id, $userId]);
        }
    }

    public function updateSortBy(int $shelfId, int $userId, string $sortBy): bool {
        $stmt = $this->db->prepare('UPDATE shelves SET sort_by = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([$sortBy, $shelfId, $userId]);
        return $stmt->rowCount() > 0;
    }
}