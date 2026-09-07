// frontend/js/presenters/BookDetailPresenter.js

class BookDetailPresenter extends BasePresenter {

    constructor(view) {
        super(view);
        this._cache = {}; // userBookId → details
    }

    // ── LOAD ──────────────────────────────────────────────────

    async loadDetails(userBookId) {
        if (this._cache[userBookId]) return this._cache[userBookId];
        // BaseModel._request ritorna già data.data,
        // quindi res = { user_book_id, details: {...} }
        const res = await api.getBookDetails(userBookId);
        const details = res?.details ?? {};
        this._cache[userBookId] = details;
        return details;
    }

    // ── SAVE ──────────────────────────────────────────────────

    async saveDetails(userBookId, payload) {
        // Non usiamo _run perché swallowa gli errori — vogliamo che
        // il chiamante possa fare catch e mostrare l'errore correttamente
        const res = await api.saveBookDetails(userBookId, payload);
        const details = res?.details ?? {};
        this._cache[userBookId] = details;
        return details;
    }

    // ── HELPERS ───────────────────────────────────────────────

    invalidate(userBookId) {
        delete this._cache[userBookId];
    }

    // Calcola % avanzamento lettura. Restituisce null se dati insufficienti.
    static calcProgress(currentPage, totalPages) {
        const cp = parseInt(currentPage, 10);
        const tp = parseInt(totalPages,  10);
        if (!tp || tp <= 0 || isNaN(cp) || isNaN(tp)) return null;
        return Math.min(100, Math.round((cp / tp) * 100));
    }
}

window.BookDetailPresenter = BookDetailPresenter;