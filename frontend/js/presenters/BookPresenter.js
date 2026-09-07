// frontend/js/presenters/BookPresenter.js

class BookPresenter extends BasePresenter {
  constructor(view) {
    super(view);
    this._filter = { shelfId: null, status: null, wishlist: false };
  }

  async loadCollection(shelfId = null, status = null, wishlist = false) {
    this._filter = { shelfId, status, wishlist };
    await this._run(async () => {
      const data = await api.getBooks(shelfId, status, wishlist);
      this.view.renderBooks(data.books, data.stats);
    });
  }

  async lookupIsbn(isbn) {
    this.view.setScanLoading(true);
    try {
      const data = await api.lookupIsbn(isbn);
      this.view.showBookPreview(data.book, data.source);
    } catch (e) {
      this.view.showScanError(e.message);
    } finally {
      this.view.setScanLoading(false);
    }
  }

  async addBook(bookData, status, shelfId, isWishlist) {
    await this._run(async () => {
        const res = await api.addBook({ book: bookData, status, shelf_id: shelfId, is_wishlist: isWishlist });
        const userBookId = res?.book?.user_book_id ?? null;
        this.view.onBookAdded(userBookId);
        await this.loadCollection(this._filter.shelfId, this._filter.status, this._filter.wishlist);
    });
  }

  async updateStatus(bookId, status) {
    await this._run(async () => {
      await api.updateBook(bookId, { status });
      await this.loadCollection(this._filter.shelfId, this._filter.status, this._filter.wishlist);
    });
  }

  async removeBook(bookId) {
    if (!confirm('Rimuovere questo libro dalla collezione?')) return;
    await this._run(async () => {
      await api.removeBook(bookId);
      await this.loadCollection(this._filter.shelfId, this._filter.status, this._filter.wishlist);
    });
  }

  async search(query) {
    if (!query.trim()) return this.loadCollection(this._filter.shelfId, null, this._filter.wishlist);
    await this._run(async () => {
      const isWishlist = this._filter.wishlist;
      const data = await api.searchBooks(query, null, isWishlist);
      this.view.renderBooks(data.books, null);
    });
  }

  async upsertReview(bookId, rating, reviewText) {
    await this._run(async () => {
      const data = await api.upsertReview(bookId, { rating, review_text: reviewText });
      this.view.onReviewSaved(data.review);
    });
  }

  async deleteReview(bookId) {
    await this._run(async () => {
      await api.deleteReview(bookId);
      this.view.onReviewDeleted();
    });
  }
}

window.BookPresenter = BookPresenter;