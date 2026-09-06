<?php
// backend/models/BookDetailModel.php

class BookDetailModel {

    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    private const ALLOWED = [
        'current_page', 'total_pages',
        'started_at', 'finished_at',
        'series_name', 'series_volume',
        'acquisition', 'acquisition_note',
        'edition_publisher', 'edition_year', 'edition_language',
        'edition_label', 'edition_format', 'edition_isbn',
        'personal_notes',
    ];

    // ── READ ──────────────────────────────────────────────────

    public function findByUserBookId(int $userBookId): ?array {
        $stmt = $this->db->prepare(
            'SELECT * FROM book_details WHERE user_book_id = ? LIMIT 1'
        );
        $stmt->execute([$userBookId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    // ── UPSERT ────────────────────────────────────────────────

    public function upsert(int $userBookId, array $data): array {
        $fields   = array_intersect_key($data, array_flip(self::ALLOWED));
        $existing = $this->findByUserBookId($userBookId);

        if ($existing === null) {
            $fields['user_book_id'] = $userBookId;
            $cols  = implode(', ', array_keys($fields));
            $phlds = implode(', ', array_map(fn($k) => ":$k", array_keys($fields)));
            $stmt  = $this->db->prepare("INSERT INTO book_details ($cols) VALUES ($phlds)");
        } else {
            $setParts = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($fields)));
            $stmt     = $this->db->prepare(
                "UPDATE book_details SET $setParts WHERE user_book_id = :user_book_id"
            );
            $fields['user_book_id'] = $userBookId;
        }

        $params = [];
        foreach ($fields as $k => $v) {
            // Stringa vuota → NULL per tutti i campi tranne le note (l'utente può svuotarle)
            $params[":$k"] = ($v === '' && $k !== 'personal_notes') ? null : $v;
        }
        $stmt->execute($params);

        return $this->findByUserBookId($userBookId) ?? [];
    }

    // ── DELETE ────────────────────────────────────────────────

    public function deleteByUserBookId(int $userBookId): void {
        $stmt = $this->db->prepare('DELETE FROM book_details WHERE user_book_id = ?');
        $stmt->execute([$userBookId]);
    }
}