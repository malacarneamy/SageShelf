<?php
// backend/models/BookModel.php

class BookModel {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function findByIsbn(string $isbn): ?array {
        $stmt = $this->db->prepare('SELECT * FROM books WHERE isbn = ?');
        $stmt->execute([$isbn]);
        return $stmt->fetch() ?: null;
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare('SELECT * FROM books WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function upsert(array $data): int {
        $existing = !empty($data['isbn']) ? $this->findByIsbn($data['isbn']) : null;
        if ($existing) return (int)$existing['id'];

        $stmt = $this->db->prepare(
            'INSERT INTO books (isbn,title,author,publisher,published_year,cover_url,description,page_count,language)
             VALUES (:isbn,:title,:author,:publisher,:published_year,:cover_url,:description,:page_count,:language)'
        );
        $stmt->execute([
            ':isbn'           => $data['isbn']           ?? null,
            ':title'          => $data['title']          ?? 'Sconosciuto',
            ':author'         => $data['author']         ?? null,
            ':publisher'      => $data['publisher']      ?? null,
            ':published_year' => $data['published_year'] ?? null,
            ':cover_url'      => $data['cover_url']      ?? null,
            ':description'    => $data['description']    ?? null,
            ':page_count'     => $data['page_count']     ?? null,
            ':language'       => $data['language']       ?? null,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getUserBooks(int $userId, ?string $status = null, ?int $shelfId = null, bool $wishlist = false, string $sortBy = 'added_desc'): array {
        $sql = '
            SELECT
                b.id, b.isbn, b.title, b.author,
                b.publisher, b.published_year,
                COALESCE(ub.custom_cover_url, b.cover_url) AS cover_url,
                b.description, b.page_count, b.language,
                ub.id          AS user_book_id,
                ub.status,
                ub.shelf_id,
                ub.is_wishlist,
                ub.added_at,
                s.name         AS shelf_name,
                r.rating,
                r.review_text
            FROM user_books ub
            JOIN  books   b ON b.id  = ub.book_id
            LEFT JOIN shelves s ON s.id  = ub.shelf_id
            LEFT JOIN reviews r ON r.book_id = b.id AND r.user_id = ub.user_id
            WHERE ub.user_id = ?';

        $params = [$userId];

        if ($wishlist) {
            $sql .= ' AND ub.is_wishlist = 1';
        } else {
            $sql .= ' AND ub.is_wishlist = 0';
            if ($status) {
                $sql .= ' AND ub.status = ?';
                $params[] = $status;
            }
        }

        if ($shelfId !== null) {
            $sql .= ' AND ub.shelf_id = ?';
            $params[] = $shelfId;
        }

        $orderMap = [
            'title'       => 'b.title ASC',
            'author'      => 'b.author ASC',
            'added_asc'   => 'ub.added_at ASC',
            'added_desc'  => 'ub.added_at DESC',
            'custom'      => 'ub.shelf_position ASC',
        ];
        $order = $orderMap[$sortBy] ?? 'ub.added_at DESC';
        $sql .= " ORDER BY {$order}";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Verifica se l'utente ha già in collezione un dato libro del catalogo
     * globale
     */
    public function getUserBook(int $userId, int $bookId): ?array {
        $stmt = $this->db->prepare('SELECT * FROM user_books WHERE user_id = ? AND book_id = ?');
        $stmt->execute([$userId, $bookId]);
        return $stmt->fetch() ?: null;
    }

    public function addToCollection(int $userId, int $bookId, string $status = 'want_to_read', ?int $shelfId = null, bool $isWishlist = false): int {
        // Scala tutte le posizioni esistenti di 1 per fare spazio in cima
        $shelfCond = $shelfId ? 'shelf_id = ?' : 'shelf_id IS NULL';
        $updateStmt = $this->db->prepare(
            "UPDATE user_books SET shelf_position = shelf_position + 1 WHERE user_id = ? AND {$shelfCond}"
        );
        $updateParams = [$userId];
        if ($shelfId) $updateParams[] = $shelfId;
        $updateStmt->execute($updateParams);

        $stmt = $this->db->prepare(
            'INSERT INTO user_books (user_id, book_id, status, shelf_id, is_wishlist, shelf_position) VALUES (?, ?, ?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE status = VALUES(status), shelf_id = VALUES(shelf_id), is_wishlist = VALUES(is_wishlist)'
        );
        $stmt->execute([$userId, $bookId, $status, $shelfId, $isWishlist ? 1 : 0]);
        $ub = $this->getUserBook($userId, $bookId);
        return (int)$ub['id'];
    }

    public function updateStatus(int $userId, int $userBookId, string $status): bool {
        $stmt = $this->db->prepare('UPDATE user_books SET status = ? WHERE user_id = ? AND id = ?');
        $stmt->execute([$status, $userId, $userBookId]);
        return $stmt->rowCount() > 0;
    }

    public function updateWishlist(int $userId, int $userBookId, bool $isWishlist): bool {
        $stmt = $this->db->prepare('UPDATE user_books SET is_wishlist = ? WHERE user_id = ? AND id = ?');
        $stmt->execute([$isWishlist ? 1 : 0, $userId, $userBookId]);
        return $stmt->rowCount() > 0;
    }

    public function updateShelf(int $userId, int $userBookId, ?int $shelfId): bool {
        $stmt = $this->db->prepare('UPDATE user_books SET shelf_id = ? WHERE user_id = ? AND id = ?');
        $stmt->execute([$shelfId, $userId, $userBookId]);
        return $stmt->rowCount() > 0;
    }

    public function removeFromCollection(int $userId, int $userBookId): bool {
        $stmt = $this->db->prepare('DELETE FROM user_books WHERE user_id = ? AND id = ?');
        $stmt->execute([$userId, $userBookId]);
        return $stmt->rowCount() > 0;
    }

    public function getStats(int $userId, ?int $shelfId = null, bool $wishlist = false): array {
        $sql    = 'SELECT status, COUNT(*) AS cnt FROM user_books WHERE user_id = ?';
        $params = [$userId];

        if ($wishlist) {
            $sql .= ' AND is_wishlist = 1';
        } else {
            $sql .= ' AND is_wishlist = 0';
            if ($shelfId !== null) { $sql .= ' AND shelf_id = ?'; $params[] = $shelfId; }
        }

        $sql .= ' GROUP BY status';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows  = $stmt->fetchAll();
        $stats = ['want_to_read' => 0, 'reading' => 0, 'read' => 0, 'total' => 0];
        foreach ($rows as $r) {
            $stats[$r['status']] = (int)$r['cnt'];
            $stats['total'] += (int)$r['cnt'];
        }
        return $stats;
    }

    /* Ricerca globale su tutta la collezione (libreria + wishlist).*/
    public function searchAll(int $userId, string $query): array {
        $q   = "%{$query}%";
        $sql = '
            SELECT
                b.id, b.isbn, b.title, b.author,
                b.publisher, b.published_year,
                COALESCE(ub.custom_cover_url, b.cover_url) AS cover_url,
                b.page_count, b.language,
                ub.id          AS user_book_id,
                ub.status,
                ub.shelf_id,
                ub.is_wishlist,
                s.name         AS shelf_name,
                r.rating,
                r.review_text
            FROM user_books ub
            JOIN  books b   ON b.id  = ub.book_id
            LEFT JOIN shelves s     ON s.id = ub.shelf_id
            LEFT JOIN reviews r     ON r.book_id = b.id AND r.user_id = ub.user_id
            LEFT JOIN book_details bd ON bd.user_book_id = ub.id
            WHERE ub.user_id = ?
            AND (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ? OR bd.series_name LIKE ?)
            ORDER BY b.title';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$userId, $q, $q, $q, $q]);
        return $stmt->fetchAll();
    }

    public function search(int $userId, string $query, ?int $shelfId = null, bool $wishlist = false): array {
        $q   = "%{$query}%";
        $sql = '
            SELECT
                b.id, b.isbn, b.title, b.author,
                b.publisher, b.published_year,
                COALESCE(ub.custom_cover_url, b.cover_url) AS cover_url,
                b.page_count, b.language,
                ub.id AS user_book_id,
                ub.status, ub.shelf_id, ub.is_wishlist
            FROM user_books ub
            JOIN books b ON b.id = ub.book_id
            LEFT JOIN book_details bd ON bd.user_book_id = ub.id
            WHERE ub.user_id = ?
            AND (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ? OR bd.series_name LIKE ?)';
        $params = [$userId, $q, $q, $q, $q];

        if ($wishlist) {
            $sql .= ' AND ub.is_wishlist = 1';
        } else {
            $sql .= ' AND ub.is_wishlist = 0';
            if ($shelfId !== null) { $sql .= ' AND ub.shelf_id = ?'; $params[] = $shelfId; }
        }

        $sql .= ' ORDER BY b.title';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Restituisce un singolo user_book con tutti i campi del libro + review.
     * Usato dalla pagina standalone book-detail.html via GET /books/{id}/show
     */
    public function findUserBookByIdAndUser(int $userBookId, int $userId): ?array {
        $stmt = $this->db->prepare('
            SELECT
                b.id, b.isbn, b.title, b.author,
                b.publisher, b.published_year,
                COALESCE(ub.custom_cover_url, b.cover_url) AS cover_url,
                b.description, b.page_count, b.language,
                ub.id          AS user_book_id,
                ub.status,
                ub.shelf_id,
                ub.is_wishlist,
                ub.added_at,
                r.rating,
                r.review_text
            FROM user_books ub
            JOIN  books   b ON b.id  = ub.book_id
            LEFT JOIN reviews r ON r.book_id = b.id AND r.user_id = ub.user_id
            WHERE ub.id = ? AND ub.user_id = ?
            LIMIT 1
        ');
        $stmt->execute([$userBookId, $userId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function updateCoverUrl(int $bookId, ?string $url): bool {
        $stmt = $this->db->prepare('UPDATE books SET cover_url = ? WHERE id = ?');
        $stmt->execute([$url, $bookId]);
        return $stmt->rowCount() > 0;
    }

    // Override della cover a livello di singolo user_book
    public function updateUserCoverUrl(int $userId, int $userBookId, ?string $url): bool {
        $stmt = $this->db->prepare(
            'UPDATE user_books SET custom_cover_url = ? WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$url, $userBookId, $userId]);
        return $stmt->rowCount() > 0;
    }

    /** Riga grezza di user_books (usata per leggere custom_cover_url prima di sovrascriverlo). */
    public function getUserBookRaw(int $userBookId): ?array {
        $stmt = $this->db->prepare('SELECT * FROM user_books WHERE id = ?');
        $stmt->execute([$userBookId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /** Traduce l'id di user_books nell'id del libro nel catalogo globale. */
    public function getBookIdFromUserBook(int $userBookId): ?int {
        $stmt = $this->db->prepare('SELECT book_id FROM user_books WHERE id = ?');
        $stmt->execute([$userBookId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (int)$row['book_id'] : null;
    }

    /** Opera sul catalogo globale (books.id), non su user_books. */
    public function updateBookData(int $bookId, array $data): bool {
        $fields = [];
        $params = [];
        if (isset($data['author'])) {
            $fields[] = 'author = ?';
            $params[] = $data['author'];
        }
        if (isset($data['title'])) {
            $fields[] = 'title = ?';
            $params[] = $data['title'];
        }
        if (!$fields) return false;
        $params[] = $bookId;
        $stmt = $this->db->prepare('UPDATE books SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($params);
        return $stmt->rowCount() > 0;
    }

    public function reorderBooks(int $userId, array $orderedIds): bool {
        $stmt = $this->db->prepare(
            'UPDATE user_books SET shelf_position = ? WHERE id = ? AND user_id = ?'
        );
        foreach ($orderedIds as $position => $userBookId) {
            $stmt->execute([$position, $userBookId, $userId]);
        }
        return true;
    }
}