// frontend/js/models/ApiModel.js

class ApiModel extends BaseModel {
    constructor() {
        super('/backend/views/api.php');
    }

    // ── Auth ──────────────────────────────────────────────────
    // Flusso OTP: 1) richiedi il codice, 2) verificalo (crea la sessione,
    // registra l'utente se non esiste ancora).
    requestRegistrationCode(data) { return this._post('/auth/register/code', data); } // { username, email }
    requestLoginCode(data)        { return this._post('/auth/login/code',    data); } // { email }
    verifyCode(data)              { return this._post('/auth/verify',        data); } // { email, code, username? }
    logout()                      { return this._post('/auth/logout'); }
    me()                          { return this._get('/auth/me'); }

    // ── Shelves ───────────────────────────────────────────────
    getShelves()             { return this._get('/shelves'); }
    createShelf(data)        { return this._post('/shelves', data); }
    updateShelf(id, data)    { return this._put(`/shelves/${id}`, data); }
    deleteShelf(id)          { return this._del(`/shelves/${id}`); }
    reorderShelves(ids)      { return this._post('/shelves/reorder', { ids }); }

    // ── Books ─────────────────────────────────────────────────
    getBooks(shelfId, status, wishlist) {
        const q = new URLSearchParams();
        if (shelfId  != null) q.set('shelf_id', shelfId);
        if (status)           q.set('status', status);
        if (wishlist === true || wishlist === 1 || wishlist === '1') {
            q.set('wishlist', '1');
        }
        return this._get('/books' + (q.toString() ? '?' + q : ''));
    }
    lookupIsbn(isbn)         { return this._get(`/books/lookup?isbn=${isbn}`); }
    searchBooks(q, shelfId, wishlist) {
        const params = new URLSearchParams({ q });
        if (shelfId != null) params.set('shelf_id', shelfId);
        if (wishlist)        params.set('wishlist', '1');
        return this._get(`/books/search?${params}`);
    }
    searchBooksAll(q) {
        return this._get(`/books/search?q=${encodeURIComponent(q)}&all=1`);
    }
    addBook(data)            { return this._post('/books', data); }
    updateBook(id, data)     { return this._put(`/books/${id}`, data); }
    removeBook(id)           { return this._del(`/books/${id}`); }
    upsertReview(id, data)   { return this._post(`/books/${id}/review`, data); }
    deleteReview(id)         { return this._del(`/books/${id}/review`); }
    // Nota: l'ordinamento passa dalle route di ShelfPresenter (/shelves/{id}/sort
    // e /shelves/sort), non da /books/sort — quest'ultima esiste lato backend
    // ma questo frontend non la usa mai.
    sortBooks(shelfId, sortBy) { return this._put(`/shelves/${shelfId}/sort`, { sort_by: sortBy }); }
    sortAllBooks(sortBy)       { return this._put('/shelves/sort', { sort_by: sortBy }); }
    reorderBooks(data)       { return this._post('/books/reorder', data); }
    patchBook(id, data)      { return this._request('PATCH', `/books/${id}`, data); }

    // ── Profilo utente ────────────────────────────────────
    updateUsername(data)     { return this._put('/auth/username', data); }
    requestEmailChange(email) { return this._post('/auth/email/code', { email }); }
    confirmEmailChange(email, code) { return this._post('/auth/email/confirm', { email, code }); }
    deleteAccount()          { return this._post('/auth/account/delete'); }
    uploadAvatar(formData) {
        return fetch(`/backend/views/api.php/auth/avatar`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
        }).then(r => r.json());
    }
    removeAvatar() { return this._del('/auth/avatar'); }

    // ── Book details ──────────────────────────────────────────
    getUserBookById(userBookId)         { return this._get(`/books/${userBookId}/show`); }
    getBookDetails(userBookId)          { return this._get(`/books/${userBookId}/details`); }
    saveBookDetails(userBookId, data)   { return this._put(`/books/${userBookId}/details`, data); }
    uploadCover(userBookId, formData) {
        return fetch(`/backend/views/api.php/books/${userBookId}/cover`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
        }).then(r => r.json());
    }
}

window.api = new ApiModel();