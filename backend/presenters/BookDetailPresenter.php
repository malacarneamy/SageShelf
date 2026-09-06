<?php
// backend/presenters/BookDetailPresenter.php

class BookDetailPresenter {

    private BookDetailModel $detailModel;
    private BookModel       $bookModel;

    public function __construct() {
        $this->detailModel = new BookDetailModel();
        $this->bookModel   = new BookModel();
    }

    // ── GET /books/{userBookId}/details ───────────────────────

    public function getDetails(int $userBookId, int $userId): array {
        // Verifica ownership: l'user_book deve appartenere all'utente
        if (!$this->_ownsUserBook($userBookId, $userId)) {
            respondError('Not found', 404);
        }

        $details = $this->detailModel->findByUserBookId($userBookId);
        return [
            'user_book_id' => $userBookId,
            'details'      => $details ?? (object)[],
        ];
    }

    // ── PUT /books/{userBookId}/details ───────────────────────

    public function saveDetails(int $userBookId, int $userId, array $body): array {
        if (!$this->_ownsUserBook($userBookId, $userId)) {
            respondError('Not found', 404);
        }

        $errors = $this->_validate($body);
        if (!empty($errors)) {
            respondError('Validation failed: ' . implode('; ', $errors), 422);
        }

        $details = $this->detailModel->upsert($userBookId, $body);
        return ['details' => $details];
    }

    // ── Helpers privati ───────────────────────────────────────

    private function _ownsUserBook(int $userBookId, int $userId): bool {
        // Database::getInstance() restituisce sempre un'istanza PDO diretta
        $stmt = Database::getInstance()->prepare(
            'SELECT id FROM user_books WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$userBookId, $userId]);
        return (bool)$stmt->fetch();
    }

    private function _validate(array $data): array {
        $errors = [];

        $cp = isset($data['current_page']) ? (int)$data['current_page'] : 0;
        $tp = isset($data['total_pages'])  ? (int)$data['total_pages']  : 0;
        if ($tp > 0 && $cp > 0 && $cp > $tp) {
            $errors[] = 'current_page non può superare total_pages';
        }

        // finished_at non può precedere started_at
        if (!empty($data['started_at']) && !empty($data['finished_at'])) {
            if ($data['finished_at'] < $data['started_at']) {
                $errors[] = 'finished_at non può precedere started_at';
            }
        }

        $validAcq = ['purchased', 'gift', 'other', '', null];
        if (array_key_exists('acquisition', $data) && !in_array($data['acquisition'], $validAcq, true)) {
            $errors[] = 'Valore acquisition non valido';
        }

        $validFmt = ['hardcover', 'paperback', 'ebook', 'audiobook', 'other', '', null];
        if (array_key_exists('edition_format', $data) && !in_array($data['edition_format'], $validFmt, true)) {
            $errors[] = 'Valore edition_format non valido';
        }

        return $errors;
    }
}