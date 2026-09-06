<?php
// backend/presenters/BookPresenter.php

class BookPresenter {
    private BookModel   $bookModel;
    private ReviewModel $reviewModel;

    public function __construct() {
        $this->bookModel   = new BookModel();
        $this->reviewModel = new ReviewModel();
    }

    // ── ISBN lookup ───────────────────────────────────────────

    public function lookupIsbn(string $isbn): array {
        $isbn = preg_replace('/[^0-9X]/', '', strtoupper($isbn));

        // Genera anche la variante alternativa (ISBN-10 <-> ISBN-13)
        $alt = match (strlen($isbn)) {
            13      => $this->_isbn13to10($isbn),
            10      => $this->_isbn10to13($isbn),
            default => null,
        };
        $candidates = array_values(array_unique(array_filter([$isbn, $alt])));

        // Catalogo locale
        foreach ($candidates as $candidate) {
            $local = $this->bookModel->findByIsbn($candidate);
            if ($local) {
                if (empty($local['cover_url']))
                    $local['cover_url'] = "https://covers.openlibrary.org/b/isbn/{$candidate}-L.jpg";
                return ['book' => $local, 'source' => 'local'];
            }
        }

        // Le prime 3 fonti vengono interrogate IN PARALLELO 
        $requests = [];
        foreach ($candidates as $c) {
            $requests["googlebooks:{$c}"]        = "https://www.googleapis.com/books/v1/volumes?q=isbn:{$c}";
            $requests["openlibrary:{$c}"]         = "https://openlibrary.org/api/books?bibkeys=ISBN:{$c}&format=json&jscmd=data";
            $requests["openlibrary-search:{$c}"]  = "https://openlibrary.org/search.json?isbn={$c}&limit=1";
        }
        $responses = httpGetMulti($requests);

        // Ordine di priorità delle FONTI 
        $parsers = [
            'googlebooks'        => fn(string $json, string $c) => $this->_parseGoogleBooks($json),
            'openlibrary'        => fn(string $json, string $c) => $this->_parseOpenLibrary($json, $c),
            'openlibrary-search' => fn(string $json, string $c) => $this->_parseOpenLibrarySearch($json),
        ];
        foreach ($parsers as $sourceName => $parse) {
            foreach ($candidates as $c) {
                $json = $responses["{$sourceName}:{$c}"] ?? null;
                if ($json === null) continue;
                $book = $parse($json, $c);
                if ($book) return ['book' => $book, 'source' => $sourceName];
            }
        }

        // Ultimo fallback, sequenziale
        foreach ($candidates as $c) {
            $book = $this->_lookupLibraryThing($c);
            if ($book) return ['book' => $book, 'source' => 'openlibrary-edition'];
        }

        respondError('Libro non trovato per ISBN: ' . $isbn, 404);
    }

    /** ISBN-13 (con prefisso 978) → ISBN-10, se convertibile. */
    private function _isbn13to10(string $isbn13): ?string {
        if (strlen($isbn13) !== 13 || !str_starts_with($isbn13, '978')) return null;
        $core = substr($isbn13, 3, 9);
        $sum  = 0;
        for ($i = 0; $i < 9; $i++) {
            $sum += ((int)$core[$i]) * (10 - $i);
        }
        $check = (11 - ($sum % 11)) % 11;
        return $core . ($check === 10 ? 'X' : (string)$check);
    }

    /** ISBN-10 → ISBN-13 (con prefisso 978). */
    private function _isbn10to13(string $isbn10): ?string {
        if (strlen($isbn10) !== 10) return null;
        $core13 = '978' . substr($isbn10, 0, 9);
        $sum    = 0;
        for ($i = 0; $i < 12; $i++) {
            $digit = (int)$core13[$i];
            $sum  += ($i % 2 === 0) ? $digit : $digit * 3;
        }
        $check = (10 - ($sum % 10)) % 10;
        return $core13 . $check;
    }

    private function _parseOpenLibrary(string $json, string $isbn): ?array {
        $data = json_decode($json, true);
        $key  = "ISBN:{$isbn}";
        if (empty($data[$key])) return null;
        $info = $data[$key];
        return [
            'isbn'           => $isbn,
            'title'          => $info['title'] ?? 'Titolo sconosciuto',
            'author'         => implode(', ', array_column($info['authors']   ?? [], 'name')),
            'publisher'      => implode(', ', array_column($info['publishers'] ?? [], 'name')),
            'published_year' => isset($info['publish_date'])
                ? ((int)preg_replace('/\D/', '', $info['publish_date']) ?: null)
                : null,
            'cover_url'      => "https://covers.openlibrary.org/b/isbn/{$isbn}-L.jpg",
            'description'    => is_array($info['notes'] ?? null)
                ? ($info['notes']['value'] ?? null)
                : ($info['notes'] ?? null),
            'page_count'     => $info['number_of_pages'] ?? null,
            'language'       => null,
        ];
    }

    private function _parseGoogleBooks(string $json): ?array {
        $data = json_decode($json, true);
        if (empty($data['items'][0]['volumeInfo'])) return null;
        $info  = $data['items'][0]['volumeInfo'];
        $cover = $info['imageLinks']['extraLarge']
            ?? $info['imageLinks']['large']
            ?? $info['imageLinks']['medium']
            ?? $info['imageLinks']['thumbnail']
            ?? null;
        if ($cover) $cover = str_replace('http://', 'https://', $cover);
        return [
            'isbn'           => $info['industryIdentifiers'][0]['identifier'] ?? null,
            'title'          => $info['title'] ?? 'Titolo sconosciuto',
            'author'         => implode(', ', $info['authors'] ?? []),
            'publisher'      => $info['publisher'] ?? null,
            'published_year' => isset($info['publishedDate'])
                ? ((int)substr($info['publishedDate'], 0, 4) ?: null)
                : null,
            'cover_url'      => $cover,
            'description'    => isset($info['description'])
                ? strip_tags($info['description'])
                : null,
            'page_count'     => $info['pageCount'] ?? null,
            'language'       => $info['language']  ?? null,
        ];
    }

    /**
     * Fallback: Open Library search API (più aggiornata della books API).
     * Utile per libri recenti non ancora indicizzati nell'API bibkeys.
     */
    private function _parseOpenLibrarySearch(string $json): ?array {
        $data = json_decode($json, true);
        if (empty($data['docs'][0])) return null;
        $doc = $data['docs'][0];

        // Costruisce cover URL tramite cover_i (cover ID numerico)
        $cover = null;
        if (!empty($doc['cover_i'])) {
            $cover = "https://covers.openlibrary.org/b/id/{$doc['cover_i']}-L.jpg";
        }

        return [
            'isbn'           => $doc['isbn'][0] ?? null,
            'title'          => $doc['title'] ?? 'Titolo sconosciuto',
            'author'         => implode(', ', $doc['author_name'] ?? []),
            'publisher'      => implode(', ', array_slice($doc['publisher'] ?? [], 0, 1)),
            'published_year' => $doc['first_publish_year'] ?? null,
            'cover_url'      => $cover,
            'description'    => null,
            'page_count'     => $doc['number_of_pages_median'] ?? null,
            'language'       => !empty($doc['language']) ? $doc['language'][0] : null,
        ];
    }

    /**
     * Fallback: Open Library Availability / WorldCat tramite ISBN.
     * Usa l'endpoint /isbn/{isbn}.json che spesso ha libri recenti.
    **/

    private function _lookupLibraryThing(string $isbn): ?array {
        $url  = "https://openlibrary.org/isbn/{$isbn}.json";
        $json = httpGet($url, 4);
        if (!$json) return null;
        $edition = json_decode($json, true);
        if (empty($edition['title'])) return null;

        // Recupera autore tramite works se disponibile
        $author = null;
        if (!empty($edition['authors'][0]['key'])) {
            $authorJson = httpGet("https://openlibrary.org{$edition['authors'][0]['key']}.json", 4);
            if ($authorJson) {
                $authorData = json_decode($authorJson, true);
                $author = $authorData['name'] ?? null;
            }
        }

        // Cover
        $cover = null;
        if (!empty($edition['covers'][0])) {
            $cover = "https://covers.openlibrary.org/b/id/{$edition['covers'][0]}-L.jpg";
        }

        return [
            'isbn'           => $isbn,
            'title'          => $edition['title'] ?? 'Titolo sconosciuto',
            'author'         => $author,
            'publisher'      => !empty($edition['publishers']) ? $edition['publishers'][0] : null,
            'published_year' => isset($edition['publish_date'])
                ? ((int)preg_replace('/\D/', '', $edition['publish_date']) ?: null)
                : null,
            'cover_url'      => $cover,
            'description'    => null,
            'page_count'     => $edition['number_of_pages'] ?? null,
            'language'       => !empty($edition['languages'][0]['key'])
                ? basename($edition['languages'][0]['key'])
                : null,
        ];
    }

    /**
     * Cerca la copertina direttamente per ISBN su Open Library Covers API
     * e Google Books. Restituisce il primo URL valido trovato.
     */
    private function _resolveCover(string $isbn): ?string {
        // Google Books thumbnail
        $gbUrl = "https://www.googleapis.com/books/v1/volumes?q=isbn:{$isbn}&fields=items/volumeInfo/imageLinks";
        $json  = httpGet($gbUrl);
        if ($json) {
            $data  = json_decode($json, true);
            $links = $data['items'][0]['volumeInfo']['imageLinks'] ?? [];
            $cover = $links['extraLarge'] ?? $links['large'] ?? $links['medium'] ?? $links['thumbnail'] ?? null;
            if ($cover) return str_replace('http://', 'https://', $cover);
        }
        // Fallback Open Library Covers
        return "https://covers.openlibrary.org/b/isbn/{$isbn}-L.jpg";
    }


    // ── Collezione ────────────────────────────────────────────

    public function getCollection(int $userId, ?string $status, ?int $shelfId, bool $wishlist = false): array {
        $sortBy = 'added_desc';
        if ($shelfId) {
            $shelf  = (new ShelfModel())->findById($shelfId, $userId);
            $sortBy = $shelf['sort_by'] ?? 'added_desc';
        } else {
            $sortBy = (new UserModel())->getAllSortBy($userId);
        }
        $books = $this->bookModel->getUserBooks($userId, $status, $shelfId, $wishlist, $sortBy);
        foreach ($books as &$b) $b = $this->_formatBook($b);
        return [
            'books' => $books,
            'stats' => $this->bookModel->getStats($userId, $shelfId, $wishlist),
        ];
    }

    public function getUserBook(int $userId, int $userBookId): array {
        $row = $this->bookModel->findUserBookByIdAndUser($userBookId, $userId);
        if (!$row) respondError('Not found', 404);
        return $this->_formatBook($row);
    }

    public function uploadCover(int $userId, int $userBookId, array $files): array {
        if (!$this->_ownsUserBook($userBookId, $userId)) {
            respondError('Libro non trovato', 404);
        }
        if (empty($files['cover']['tmp_name'])) respondError('Nessun file ricevuto');

        $file    = $files['cover'];
        $allowed = ['image/jpeg', 'image/png', 'image/webp'];
        $mime    = mime_content_type($file['tmp_name']);
        if (!in_array($mime, $allowed)) respondError('Formato non supportato');
        if ($file['size'] > 5 * 1024 * 1024) respondError('File troppo grande (max 5MB)');

        $bookId = $this->bookModel->getBookIdFromUserBook($userBookId);
        if (!$bookId) respondError('Libro non trovato', 404);

        // Elimina vecchia copertina da Cloudinary se esiste
        $current = $this->bookModel->findById($bookId);
        if (!empty($current['cover_url']) && str_contains($current['cover_url'], 'cloudinary.com')) {
            $publicId = pathinfo(parse_url($current['cover_url'], PHP_URL_PATH), PATHINFO_FILENAME);
            $this->_cloudinaryDelete('sageshelf/covers/' . $publicId);
        }

        $url = $this->_cloudinaryUpload($file['tmp_name'], 'sageshelf/covers');
        if (!$url) respondError('Errore caricamento su Cloudinary');

        $this->bookModel->updateCoverUrl($bookId, $url);
        return ['cover_url' => $url];
    }

    private function _cloudinaryUpload(string $filePath, string $folder): ?string {
        if (CLOUDINARY_CLOUD_NAME === '' || CLOUDINARY_API_KEY === '' || CLOUDINARY_API_SECRET === '') {
            error_log('_cloudinaryUpload: credenziali Cloudinary non configurate in .env');
            return null;
        }

        $timestamp    = time();
        $paramsToSign = "folder={$folder}&timestamp={$timestamp}";
        $signature    = sha1($paramsToSign . CLOUDINARY_API_SECRET);

        $ch = curl_init("https://api.cloudinary.com/v1_1/" . CLOUDINARY_CLOUD_NAME . "/image/upload");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'file'      => new CURLFile($filePath),
            'folder'    => $folder,
            'timestamp' => $timestamp,
            'api_key'   => CLOUDINARY_API_KEY,
            'signature' => $signature,
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($curlErr !== '') { error_log('_cloudinaryUpload cURL error: ' . $curlErr); return null; }
        if ($httpCode < 200 || $httpCode >= 300) { error_log('_cloudinaryUpload error (' . $httpCode . '): ' . $response); return null; }

        $data = json_decode((string)$response, true);
        return $data['secure_url'] ?? null;
    }

    private function _cloudinaryDelete(string $publicId): bool {
        if (CLOUDINARY_CLOUD_NAME === '' || CLOUDINARY_API_KEY === '' || CLOUDINARY_API_SECRET === '') {
            return false;
        }

        $timestamp    = time();
        $paramsToSign = "public_id={$publicId}&timestamp={$timestamp}";
        $signature    = sha1($paramsToSign . CLOUDINARY_API_SECRET);

        $ch = curl_init("https://api.cloudinary.com/v1_1/" . CLOUDINARY_CLOUD_NAME . "/image/destroy");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'public_id' => $publicId,
            'timestamp' => $timestamp,
            'api_key'   => CLOUDINARY_API_KEY,
            'signature' => $signature,
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $httpCode >= 200 && $httpCode < 300;
    }

    // ── CRUD ──────────────────────────────────────────────────

    public function addBook(int $userId, array $body): array {
        $bookData   = $body['book']   ?? respondError('Dati libro mancanti');
        $status     = $body['status'] ?? 'want_to_read';
        $shelfId    = isset($body['shelf_id']) ? (int)$body['shelf_id'] : null;
        $isWishlist = !empty($body['is_wishlist']);

        if (!in_array($status, ['want_to_read', 'reading', 'read'])) {
            respondError('Status non valido');
        }

        $bookId = $this->bookModel->upsert($bookData);
        $existing = $this->bookModel->getUserBook($userId, $bookId);
        if ($existing) {
            $where = $existing['is_wishlist'] ? 'lista desideri' : 'collezione';
            respondError("Libro già presente nella {$where}", 409);
        }
        $userBookId = $this->bookModel->addToCollection($userId, $bookId, $status, $shelfId, $isWishlist);

        return ['book' => ['user_book_id' => $userBookId]];
    }

    public function updateBook(int $userId, int $id, array $body): array {
        if (!$this->_ownsUserBook($id, $userId)) {
            respondError('Libro non trovato', 404);
        }

        if (isset($body['status'])) {
            if (!in_array($body['status'], ['want_to_read', 'reading', 'read'])) {
                respondError('Status non valido');
            }
            $this->bookModel->updateStatus($userId, $id, $body['status']);
        }
        if (isset($body['is_wishlist'])) {
            $this->bookModel->updateWishlist($userId, $id, (bool)$body['is_wishlist']);
        }
        if (array_key_exists('shelf_id', $body)) {
            $this->bookModel->updateShelf(
                $userId,
                $id,
                $body['shelf_id'] ? (int)$body['shelf_id'] : null
            );
        }
        if (array_key_exists('cover_url', $body)) {
            $bookId = $this->bookModel->getBookIdFromUserBook($id);
            if ($bookId) {
                // Se si sta rimuovendo la copertina, elimina il file locale se esiste
                if (empty($body['cover_url'])) {
                    $current = $this->bookModel->findById($bookId);
                    if (!empty($current['cover_url'])) {
                        $localPrefix = '/bookshelf/frontend/assets/covers/';
                        if (str_starts_with($current['cover_url'], $localPrefix)) {
                            $filePath = $_SERVER['DOCUMENT_ROOT'] . $localPrefix
                                . basename($current['cover_url']);
                            $filePath = str_replace('/', DIRECTORY_SEPARATOR, $filePath);
                            if (file_exists($filePath)) @unlink($filePath);
                        }
                    }
                }
                $this->bookModel->updateCoverUrl($bookId, $body['cover_url'] ?: null);
            }
        }
        return ['updated' => true];
    }

    public function removeBook(int $userId, int $bookId): array {
        if (!$this->bookModel->removeFromCollection($userId, $bookId)) {
            respondError('Libro non trovato', 404);
        }
        return ['removed' => true];
    }

    public function searchCollection(int $userId, string $query, ?int $shelfId, bool $wishlist): array {
        return ['books' => $this->bookModel->search($userId, $query, $shelfId, $wishlist)];
    }

    /**
     * GET /books/search-all?q=...
     * Ricerca globale su libreria + wishlist.
     */
    public function searchAll(int $userId, string $query): array {
        if (strlen(trim($query)) === 0) return ['books' => []];
        $books = $this->bookModel->searchAll($userId, $query);
        foreach ($books as &$b) $b = $this->_formatBook($b);
        return ['books' => $books];
    }

    // ── Recensioni ────────────────────────────────────────────

    public function upsertReview(int $userId, int $bookId, array $body): array {
        $rating = (int)($body['rating']      ?? 0);
        $text   = trim($body['review_text']  ?? '');
        if ($rating < 1 || $rating > 5) respondError('Rating tra 1 e 5');
        return ['review' => $this->reviewModel->upsert($userId, $bookId, $rating, $text)];
    }

    public function deleteReview(int $userId, int $bookId): array {
        $this->reviewModel->delete($userId, $bookId);
        return ['deleted' => true];
    }

    // ── Helper privato ────────────────────────────────────────

    private function _formatBook(array $b): array {
        return $b;
    }

    private function _ownsUserBook(int $userBookId, int $userId): bool {
        $stmt = Database::getInstance()->prepare(
            'SELECT id FROM user_books WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$userBookId, $userId]);
        return (bool)$stmt->fetch();
    }

    public function updateBookData(int $userId, int $id, array $body): array {
        if (!$this->_ownsUserBook($id, $userId)) {
            respondError('Libro non trovato', 404);
        }
        $bookId = $this->bookModel->getBookIdFromUserBook($id);
        if (!$bookId) respondError('Libro non trovato', 404);
        $this->bookModel->updateBookData($bookId, $body);
        return ['updated' => true];
    }

    public function sortBooks(int $userId, ?int $shelfId, string $by, bool $wishlist): array {
        if ($shelfId) {
            (new ShelfModel())->updateSortBy($shelfId, $userId, $by);
        } else {
            (new UserModel())->updateAllSortBy($userId, $by);
        }
        return ['reordered' => true];
    }

    public function reorderBooks(int $userId, array $ids): array {
        $this->bookModel->reorderBooks($userId, $ids);
        return ['reordered' => true];
    }
}