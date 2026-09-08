<?php
// backend/views/api.php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$script = $_SERVER['SCRIPT_NAME'];
$path = '/' . ltrim(substr($uri, strlen($script)), '/');

$parts    = explode('/', trim($path, '/'));
$resource = $parts[0] ?? '';
$id       = isset($parts[1]) && is_numeric($parts[1]) ? (int)$parts[1] : null;
$sub      = isset($parts[1]) && !is_numeric($parts[1]) ? $parts[1] : ($parts[2] ?? null);

$body = getBody();

try {
    match($resource) {

        'auth' => (function () use ($method, $parts, $body) {
            $action = $parts[1] ?? '';
            $sub    = $parts[2] ?? '';
            $p = new AuthPresenter();
            respond(match(true) {
                // ── Richiesta codice OTP (registrazione / login) ────────────
                $method === 'POST' && $action === 'register' && $sub === 'code' =>
                    $p->requestRegistrationCode($body),
                $method === 'POST' && $action === 'login' && $sub === 'code' =>
                    $p->requestLoginCode($body),
                // ── Verifica codice OTP (crea sessione, registra se nuovo) ──
                $method === 'POST' && $action === 'verify' =>
                    $p->verifyCode($body),
                $method === 'POST' && $action === 'logout' => $p->logout(),
                $method === 'GET'  && $action === 'me' => $p->me(),
                $method === 'PUT'  && $action === 'username' => $p->updateUsername(requireAuth(), $body),
                $method === 'POST' && $action === 'account' && $sub === 'delete' =>
                    $p->deleteAccount(requireAuth()),
                $method === 'POST'   && $action === 'avatar' => $p->uploadAvatar(requireAuth(), $_FILES),
                $method === 'DELETE' && $action === 'avatar' => $p->removeAvatar(requireAuth()),

                default => respondError('Route non trovata', 404),
            });
        })(),

        'shelves' => (function () use ($method, $id, $sub, $body) {
            $userId = requireAuth();
            $p = new ShelfPresenter();
            respond(match(true) {
                $method === 'GET'    && $id === null                  => $p->getAll($userId),
                $method === 'POST'   && $id === null && $sub === null => $p->create($userId, $body),
                $method === 'PUT'    && $id !== null && $sub === null => $p->update($userId, $id, $body),
                $method === 'DELETE' && $id !== null                  => $p->delete($userId, $id),
                $method === 'POST'   && $sub === 'reorder'            => $p->reorder($userId, $body),
                $method === 'PUT'    && $id !== null && $sub === 'sort' => $p->updateSort($userId, $id, $body),
                $method === 'PUT' && $id === null && $sub === 'sort' => $p->updateAllSort($userId, $body),
                default => respondError('Route non trovata', 404),
            });
        })(),

        'books' => (function () use ($method, $id, $sub, $body) {
            $userId   = requireAuth();
            $p        = new BookPresenter();
            $dp       = new BookDetailPresenter();
            $shelfId  = isset($_GET['shelf_id']) ? (int)$_GET['shelf_id'] : null;
            $wishlist = isset($_GET['wishlist']) && $_GET['wishlist'] === '1';

            respond(match(true) {
                // ── Lookup / Search ──────────────────────────────────────────
                $method === 'GET' && $sub === 'lookup' =>
                    $p->lookupIsbn($_GET['isbn'] ?? respondError('ISBN mancante')),
                $method === 'GET' && $sub === 'search' && isset($_GET['all']) =>
                    $p->searchAll($userId, $_GET['q'] ?? ''),
                $method === 'GET' && $sub === 'search' =>
                    $p->searchCollection($userId, $_GET['q'] ?? '', $shelfId, $wishlist),

                // ── Singolo user_book (per pagina standalone) ───────────────
                $method === 'GET' && $id !== null && $sub === 'show' =>
                    $p->getUserBook($userId, $id),

                // ── Dettagli personali libro ─────────────────────────────────
                $method === 'GET' && $id !== null && $sub === 'details' =>
                    $dp->getDetails($id, $userId),
                $method === 'PUT' && $id !== null && $sub === 'details' =>
                    $dp->saveDetails($id, $userId, $body),

                // ── Collezione ───────────────────────────────────────────────
                $method === 'GET' && $id === null && $sub === null =>
                    $p->getCollection($userId, $_GET['status'] ?? null, $shelfId, $wishlist),

                // ── Riordina / ordina libri ──────────────────────────────────
                $method === 'POST' && $sub === 'reorder' =>
                    $p->reorderBooks($userId, $body['ids'] ?? []),
                $method === 'POST' && $sub === 'sort' =>
                    $p->sortBooks(
                        $userId,
                        isset($body['shelf_id']) ? (int)$body['shelf_id'] : null,
                        $body['by'] ?? 'title',
                        !empty($body['wishlist'])
                    ),
                $method === 'POST' && $id === null =>
                    $p->addBook($userId, $body),
                $method === 'PUT' && $id !== null && $sub === null =>
                    $p->updateBook($userId, $id, $body),
                $method === 'DELETE' && $id !== null && $sub === null =>
                    $p->removeBook($userId, $id),

                // ── Recensioni ───────────────────────────────────────────────
                $method === 'POST'   && $id !== null && $sub === 'review' =>
                    $p->upsertReview($userId, $id, $body),
                $method === 'DELETE' && $id !== null && $sub === 'review' =>
                    $p->deleteReview($userId, $id),

                // ── Cover upload ─────────────────────────────────────────────
                $method === 'POST' && $id !== null && $sub === 'cover' =>
                    $p->uploadCover($userId, $id, $_FILES),

                // ── Aggiornamento dati libro (autore, titolo) ────────────────
                $method === 'PATCH' && $id !== null && $sub === null =>
                    $p->updateBookData($userId, $id, $body),

                default => respondError('Route non trovata', 404),
            });
        })(),

        default => respondError('Risorsa non trovata', 404),
    };
} catch (Throwable $e) {
    error_log('FATAL: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    respondError($e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine(), 500);
}