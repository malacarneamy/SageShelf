<?php
// backend/models/ReviewModel.php

class ReviewModel {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function upsert(int $userId, int $bookId, int $rating, string $reviewText): array {
        $stmt = $this->db->prepare(
            'INSERT INTO reviews (user_id, book_id, rating, review_text)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), review_text = VALUES(review_text), updated_at = NOW()'
        );
        $stmt->execute([$userId, $bookId, $rating, $reviewText]);
        return $this->getByUserAndBook($userId, $bookId);
    }

    public function getByUserAndBook(int $userId, int $bookId): ?array {
        $stmt = $this->db->prepare(
            'SELECT r.*, b.title AS book_title
             FROM reviews r JOIN books b ON b.id = r.book_id
             WHERE r.user_id = ? AND r.book_id = ?'
        );
        $stmt->execute([$userId, $bookId]);
        return $stmt->fetch() ?: null;
    }

    public function getByBook(int $bookId): array {
        $stmt = $this->db->prepare(
            'SELECT r.*, u.username FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.book_id = ?'
        );
        $stmt->execute([$bookId]);
        return $stmt->fetchAll();
    }

    public function delete(int $userId, int $bookId): bool {
        $stmt = $this->db->prepare('DELETE FROM reviews WHERE user_id = ? AND book_id = ?');
        $stmt->execute([$userId, $bookId]);
        return $stmt->rowCount() > 0;
    }
}