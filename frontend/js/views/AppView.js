// frontend/js/views/AppView.js

class AppView extends BaseView {
    constructor() {
        super();
        this.authPresenter        = new AuthPresenter(this);
        this.bookPresenter        = new BookPresenter(this);
        this.shelfPresenter       = new ShelfPresenter(this);
        this.bookDetailPresenter  = new BookDetailPresenter(this);

        this._currentUser      = null;
        this._shelves          = [];
        this._activeShelfIndex = 0;
        this._lastShelfIndex   = 0;
        this._activeSection    = 'library';
        this._activeStatus     = null;  // null = tutti, oppure 'want_to_read'|'reading'|'read'
        this._scanner          = null;
        this._editingBook      = null;
        this._detailBook       = null;
        this._reviewBookId     = null;

        this._bindStaticEvents();
    }

    async init() {
        this._loadTheme();
        this._dragEnabled = false;
        await this.authPresenter.init();
    }

    // ── Auth ──────────────────────────────────────────────────

    onLoggedIn(user) {
        this._currentUser = user;
        document.getElementById('auth-screen').classList.add('hidden');
        const appScreen = document.getElementById('app-screen');
        appScreen.classList.remove('hidden');
        appScreen.style.cssText = 'display: flex !important; flex-direction: column; height: 100vh; overflow: hidden;';
        document.getElementById('nav-username')?.setAttribute('title', user.username);
        document.getElementById('nav-username-desktop')?.setAttribute('title', user.username);
        document.getElementById('hamburger-wrap')?.classList.remove('hidden');
        document.getElementById('bottom-nav')?.classList.remove('hidden');
        // Mostra avatar se presente
        if (user.avatar_url) {
            const avatarImg = `<img src="${user.avatar_url}" class="nav-avatar-img" alt="avatar">`;
            const navUsername = document.getElementById('nav-username');
            if (navUsername) navUsername.innerHTML = avatarImg + '<span>Profilo</span>';
            const navUsernameDesktop = document.getElementById('nav-username-desktop');
            if (navUsernameDesktop) navUsernameDesktop.innerHTML = avatarImg;
        }
        this.shelfPresenter.load();
        this._loadCurrentView();

        // Trascina verso il basso per aggiornare (mobile)
        if (!this._ptrBound) {
            this._ptrBound = true;
            new PullToRefresh({
                container: document.querySelector('.main-content'),
                indicator: document.getElementById('ptr-indicator'),
                onRefresh: () => this._loadCurrentView(),
            });
        }

        // Pulsante torna su — registrato dopo che main-content è visibile
        const scrollBtn  = document.getElementById('scroll-top-btn');
        const scrollable = document.querySelector('.main-content');
        scrollable?.addEventListener('scroll', () => {
            scrollBtn.classList.toggle('visible', scrollable.scrollTop > 300);
        });
        scrollBtn.addEventListener('click', () => {
            scrollable?.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    onLoggedOut() {
        this._currentUser = null;
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
        document.getElementById('hamburger-wrap')?.classList.add('hidden');
        document.getElementById('bottom-nav')?.classList.add('hidden');
    }

    // Step 1 dell'OTP completato: passa il form dall'inserimento
    // email/username all'inserimento del codice ricevuto via mail.
    onCodeRequested(email, username = null) {
        this._pendingAuthEmail    = email;
        this._pendingAuthUsername = username;
        document.getElementById('auth-step-request')?.classList.add('hidden');
        document.getElementById('auth-step-verify')?.classList.remove('hidden');
        document.getElementById('auth-code-sent-to').textContent = email;
        document.getElementById('auth-code')?.focus();
        this.showSuccess('Codice inviato! Controlla la tua email.');
    }

    // ── Section switching ─────────────────────────────────────

    _switchSection(section) {
        if (this._activeSection === 'library' && section !== 'library') {
            this._lastShelfIndex = this._activeShelfIndex;
        }
    
        this._activeSection = section;
        if (section === 'library') {
            this._activeShelfIndex = this._lastShelfIndex;
        }

        document.querySelectorAll('.nav-section').forEach(nav => {
            nav.classList.remove('active');
            if (nav.dataset.section === section) {
                nav.classList.add('active');
            }
        });

        const isWishlist = section === 'wishlist';
        const shelfPills = document.getElementById('shelf-pills');
        const shelfArrows = document.getElementById('shelf-arrows');
        const sectionHeader = document.getElementById('section-header');

        if (shelfPills) shelfPills.classList.toggle('hidden', isWishlist);
        if (shelfArrows) shelfArrows.classList.toggle('hidden', isWishlist);
        document.getElementById('shelf-prev')?.classList.toggle('hidden', isWishlist);
        document.getElementById('shelf-next')?.classList.toggle('hidden', isWishlist);
        document.querySelector('.shelf-name-bar')?.classList.toggle('hidden', isWishlist);
        document.querySelector('.content-header-top')?.style.setProperty('margin-bottom', isWishlist ? '0.5rem' : '2.5rem');
        document.getElementById('shelf-pills')?.style.setProperty('margin-bottom', isWishlist ? '0' : '');
        
        if (sectionHeader) {
            if (isWishlist) { sectionHeader.innerHTML = `<img src="assets/img/lista_desideri.png" alt="Lista desideri" class="header-logo">`;
            } else { sectionHeader.innerHTML = `<img src="assets/img/collezione.png" alt="Collezione" class="header-logo">`; }
        }

        this._activeStatus = null;
        this._renderShelfPills();
        this._loadCurrentView();
    }

    _loadCurrentView() {
        const isWishlist = this._activeSection === 'wishlist';
        const shelfId    = (!isWishlist && this._activeShelfIndex > 0)
            ? (this._shelves[this._activeShelfIndex - 1]?.id ?? null)
            : null;
        // Passa il filtro status (null = tutti)
        this.bookPresenter.loadCollection(shelfId, this._activeStatus, isWishlist);
    }

    // ── Shelves ───────────────────────────────────────────────

    renderShelves(shelves) {
        this._shelves = shelves;
        this._renderShelfPills();
        this._renderShelfSelectInModal();
    }

    onShelfSaved() {
        this._closeModal('modal-shelf');
        this.showSuccess('Scaffale salvato!');
        this.shelfPresenter.load();
        this._loadCurrentView();
    }

    _renderShelfPills() {
        const track = document.getElementById('shelf-pills-track');
        if (!track) return;
        const total = this._shelves.length + 1;

        const allPill = `<button class="shelf-pill ${this._activeShelfIndex === 0 ? 'active' : ''}" data-shelf-index="0">Tutti</button>`;
        const pills = this._shelves.map((s, i) => `
            <button class="shelf-pill ${this._activeShelfIndex === i + 1 ? 'active' : ''}"
                    data-shelf-index="${i + 1}" data-shelf-id="${s.id}" data-shelf-name="${this._esc(s.name)}">
                ${this._esc(s.name)}
            </button>`).join('');
        const addPill = ``;

        track.innerHTML = allPill + pills + addPill;
        this._updateArrows(total);

        track.querySelectorAll('.shelf-pill[data-shelf-index]').forEach(pill => {
            pill.addEventListener('click', () => {
                this._activeShelfIndex = parseInt(pill.dataset.shelfIndex);
                this._lastShelfIndex   = this._activeShelfIndex;
                this._activeStatus     = null;  // reset filtro al cambio scaffale
                track.querySelectorAll('.shelf-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this._updateArrows(total);
                this._updateShelfCurrentName();
                this._loadCurrentView();
            });
        });

        this._updateShelfCurrentName();
    }

    _updateArrows(total) {
        document.getElementById('shelf-prev').disabled = this._activeShelfIndex === 0;
        document.getElementById('shelf-next').disabled = this._activeShelfIndex >= total - 1;
    }

    _updateShelfCurrentName() {
        const nameEl = document.getElementById('shelf-current-name');
        if (!nameEl) return;

        if (this._activeShelfIndex === 0) {
            nameEl.textContent = 'Tutti';
            nameEl.dataset.shelfId   = '';
            nameEl.dataset.shelfName = '';
            nameEl.classList.remove('is-shelf');
            nameEl.title = '';
        } else {
            const shelf = this._shelves[this._activeShelfIndex - 1];
            nameEl.textContent       = shelf?.name ?? '';
            nameEl.dataset.shelfId   = String(shelf?.id ?? '');
            nameEl.dataset.shelfName = shelf?.name ?? '';
            nameEl.classList.add('is-shelf');
            nameEl.title = 'Clicca per rinominare';
        }
    }

    _renderShelfSelectInModal() {
        const sel = document.getElementById('scan-shelf-select');
        if (!sel) return;
        sel.innerHTML = `<option value="">— Nessuno —</option>` +
            this._shelves.map(s => `<option value="${s.id}">${this._esc(s.name)}</option>`).join('');
    }

    _openShelfModal(id, name) {
        document.getElementById('shelf-modal-title').textContent = id ? 'Modifica scaffale' : 'Nuovo scaffale';
        document.getElementById('shelf-name-input').value = name || '';
        document.getElementById('shelf-save-btn').dataset.editId = id || '';
        document.getElementById('shelf-delete-btn').classList.toggle('hidden', !id);
        document.getElementById('shelf-delete-btn').dataset.shelfId = id || '';
        this._openModal('modal-shelf');
    }

    // ── Books ─────────────────────────────────────────────────

    renderBooks(books, stats) {
        if (stats) this._renderStats(stats);
        this._renderBookGrid(books);
    }

    setScanLoading(on) {
        const btn = document.getElementById('scan-confirm-btn');
        if (btn) btn.disabled = on;
    }

    showBookPreview(book, source) {
        document.getElementById('scan-manual-btn').disabled = false;
        document.getElementById('scan-isbn-display').textContent = '—';
        if (!book) { this.showScanError('Libro non trovato'); return; }
        this._editingBook = book;
        // Nasconde il blocco not-found se il libro viene trovato
        document.getElementById('scan-not-found')?.classList.add('hidden');
        document.getElementById('scan-error').textContent = '';
        const p = document.getElementById('scan-preview');
        p.classList.remove('hidden');
        p.querySelector('.preview-cover').src         = book.cover_url || 'assets/no-cover.svg';
        p.querySelector('.preview-title').textContent  = book.title || 'Titolo sconosciuto';
        p.querySelector('.preview-author').textContent = book.author || 'Autore sconosciuto';
        p.querySelector('.preview-year').textContent   = book.published_year || '';
        const badges = { local: 'In catalogo', openlibrary: '🌐 Open Library', googlebooks: '🔍 Google Books' };
        p.querySelector('.preview-badge').textContent = badges[source] ?? '🌐 Online';
    }

    showScanError(msg) {
        document.getElementById('scan-manual-btn').disabled = false;
        document.getElementById('scan-isbn-display').textContent = '—';
        document.getElementById('scan-error').textContent = msg;
        // Mostra il pulsante "Aggiungi manualmente" solo quando il libro non è trovato
        const notFound = document.getElementById('scan-not-found');
        if (notFound) {
            notFound.classList.toggle('hidden', !msg);
        }
    }

    getManualBookData() {
        return {
            isbn:           document.getElementById('manual-isbn').value.trim() || null,
            title:          document.getElementById('manual-title').value.trim(),
            author:         document.getElementById('manual-author').value.trim(),
            publisher:      document.getElementById('manual-publisher').value.trim(),
            published_year: document.getElementById('manual-year').value || null,
            cover_url: null, description: null, page_count: null, language: null,
        };
    }

    onBookAdded(userBookId) {
        const seriesName   = document.getElementById('scan-series-name')?.value.trim()
                        || document.getElementById('manual-series-name')?.value.trim();
        const seriesVolume = document.getElementById('scan-series-volume')?.value
                        || document.getElementById('manual-series-volume')?.value;

        this._closeModal('modal-scan');
        this._closeModal('modal-manual');
        this._stopScanner();

        if (userBookId && seriesName) {
            api.saveBookDetails(userBookId, {
                series_name:   seriesName,
                series_volume: seriesVolume || null,
            }).catch(e => console.error('serie:', e));
        }

        this._resetScanModal();
        this._resetManualModal();
        this.showSuccess('Libro aggiunto!');
        this._loadCurrentView();
    }

    onReviewSaved() {
        this._closeModal('modal-review');
        this.showSuccess('Recensione salvata!');
        this._loadCurrentView();
    }

    onReviewDeleted() {
        this._closeModal('modal-review');
        this._loadCurrentView();
    }

    // ── Rendering ─────────────────────────────────────────────

    _renderStats(stats) {
        const isWishlist = this._activeSection === 'wishlist';
        document.getElementById('stats-library').classList.toggle('hidden', isWishlist);
        document.getElementById('stats-wishlist').classList.toggle('hidden', !isWishlist);

        if (isWishlist) {
            document.getElementById('stat-wish-total').textContent = stats.total;
        } else {
            document.getElementById('stat-total').textContent   = stats.total;
            document.getElementById('stat-want').textContent    = stats.want_to_read;
            document.getElementById('stat-reading').textContent = stats.reading;
            document.getElementById('stat-read').textContent    = stats.read;

            // Evidenzia la stat card attiva
            const map = {
                null:           'stat-card--total',
                'want_to_read': 'stat-card--want',
                'reading':      'stat-card--reading',
                'read':         'stat-card--read',
            };
            document.querySelectorAll('#stats-library .stat-card').forEach(el => {
                el.classList.remove('stat-card--active');
            });
            const activeId = {
                null:           'stat-total',
                'want_to_read': 'stat-want',
                'reading':      'stat-reading',
                'read':         'stat-read',
            }[this._activeStatus];
            if (activeId) {
                document.getElementById(activeId)?.closest('.stat-card')?.classList.add('stat-card--active');
            }
        }
    }

    _renderBookGrid(books) {
        const grid = document.getElementById('book-grid');
        if (!books.length) {
            grid.innerHTML = `<div class="empty-state"><img src="assets/img/libro.png" alt="" class="empty-img"><p>Nessun libro qui. Aggiungine uno!</p></div>`;
            return;
        }
        grid.innerHTML = books.map(b => this._bookCard(b)).join('');
        grid.querySelectorAll('.book-card').forEach(card => {
            if (this._dragEnabled) {
                card.setAttribute('draggable', true);
            }

            card.addEventListener('click', () => {
                const book = JSON.parse(card.dataset.book);
                this._openBookDetail(book);
            });

        // Drag & drop — solo se abilitato dal pulsante "Personalizzato"
        if (this._dragEnabled) {
            card.setAttribute('draggable', true);
            card.addEventListener('dragstart', e => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.book);
                card.classList.add('dragging');
                this._draggedCard = card;
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                grid.querySelectorAll('.book-card').forEach(c => c.classList.remove('drag-over'));
                this._draggedCard = null;
                this._saveDragOrder();
            });
            card.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (card !== this._draggedCard) {
                    grid.querySelectorAll('.book-card').forEach(c => c.classList.remove('drag-over'));
                    card.classList.add('drag-over');
                    const cards   = [...grid.querySelectorAll('.book-card')];
                    const fromIdx = cards.indexOf(this._draggedCard);
                    const toIdx   = cards.indexOf(card);
                    if (fromIdx < toIdx) card.after(this._draggedCard);
                    else card.before(this._draggedCard);
                }
            });
            card.addEventListener('drop', e => {
                e.preventDefault();
                card.classList.remove('drag-over');
            });
        }
        });
    }

    async _saveDragOrder() {
        const grid = document.getElementById('book-grid');
        const ids  = [...grid.querySelectorAll('.book-card')]
            .map(c => JSON.parse(c.dataset.book).user_book_id);
        const shelfId = this._activeShelfIndex > 0
            ? this._shelves[this._activeShelfIndex - 1]?.id
            : null;
        try {
            if (shelfId) {
                await api.sortBooks(shelfId, 'custom');
                await api.reorderBooks({ ids });
            } else {
                await api.sortAllBooks('custom');
                await api.reorderBooks({ ids });
            }
        } catch (e) {
            console.error('Errore salvataggio ordine:', e);
        }
    }

    _bookCard(b) {
        const stars = b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '☆☆☆☆☆';
        // Passiamo anche publisher, page_count, language al dataset per averli nel modal
        return `
        <article class="book-card" data-book='${JSON.stringify({
            id:             b.id,
            user_book_id:   b.user_book_id,
            title:          b.title,
            author:         b.author,
            publisher:      b.publisher      ?? null,
            published_year: b.published_year ?? null,
            page_count:     b.page_count     ?? null,
            language:       b.language       ?? null,
            isbn:           b.isbn           ?? null,
            cover_url:      b.cover_url,
            status:         b.status,
            shelf_id:       b.shelf_id,
            rating:         b.rating,
            review_text:    b.review_text,
            is_wishlist:    b.is_wishlist
        }).replace(/'/g, "&#39;")}'>
            <div class="book-cover-wrap">
                <img class="book-cover" src="${b.cover_url || (document.documentElement.getAttribute('data-theme') === 'night' ? 'assets/no-cover-black.svg' : 'assets/no-cover.svg')}"
                    alt="${this._esc(b.title)}" loading="lazy">
            </div>
            <div class="book-info">
                <h3 class="book-title">${this._esc(b.title)}</h3>
                <p class="book-author">${this._esc(b.author || 'Autore sconosciuto')}</p>
                ${b.is_wishlist != 1 ? `<p class="book-stars">${stars}</p>` : ''}
            </div>
        </article>`;
    }

    // ── Book detail modal ─────────────────────────────────────

    async _openBookDetail(book) {
        this._detailBook = book;
        const userBookId = book.user_book_id ?? book.id;
        const details    = await this.bookDetailPresenter.loadDetails(userBookId) ?? {};
        this._renderDetailModal(book, details);
        this._openModal('modal-book-detail');

        // Autocompila editore e ISBN dai dati globali del libro se non già salvati in details.
        // I valori sono già visibili nel campo (fallback su book.*), ma vogliamo anche
        // fare un lookup ISBN per arricchire i dati se mancanti.
        const isbn = (details.edition_isbn || book.isbn || '').replace(/[^0-9X\-]/gi, '').trim();
        if (isbn) {
            this._autofillEditionFromIsbn(isbn, details, book);
        }
    }

    async _autofillEditionFromIsbn(isbn, details, book) {
        // Se editore e ISBN sono già in details non facciamo nulla
        const needsPublisher = !details.edition_publisher;
        const needsIsbn      = !details.edition_isbn;
        if (!needsPublisher && !needsIsbn) return;

        try {
            const res = await api.lookupIsbn(isbn);
            const data = res?.book ?? res;

            const publisherField = document.getElementById('bd-edition-publisher');
            const isbnField      = document.getElementById('bd-edition-isbn');

            if (needsPublisher && publisherField && !publisherField.value && data?.publisher) {
                publisherField.value = data.publisher;
            }
            if (needsIsbn && isbnField && !isbnField.value && data?.isbn) {
                isbnField.value = data.isbn;
            }
        } catch {
            // Lookup fallito silenziosamente — i campi restano vuoti
        }
    }

    _renderDetailModal(book, details) {
        const isWishlist = this._activeSection === 'wishlist';
        const userBookId = book.user_book_id ?? book.id;  // user_books.id → per saveDetails
        const bookId     = book.id;                        // books.id → solo per riferimento nel DOM (data-book-id)
        const rating     = book.rating ?? 0;

        const isRead  = book.status === 'read';
        const initCp  = isRead ? (details.total_pages || book.page_count || '') : (details.current_page || '');
        const initTp  = details.total_pages || book.page_count || '';
        const initPct = isRead ? 100 : (BookDetailPresenter.calcProgress(initCp, initTp) ?? 0);

        const STATUS_LABELS = { want_to_read: 'Da leggere', reading: 'In lettura', read: 'Letto' };
        const ACQ_ICONS     = { purchased: '🛒', gift: '🎁', other: '📦' };

        const dispPublisher = details.edition_publisher || book.publisher || '';
        const dispYear      = details.edition_year      || book.published_year || '';
        const dispLanguage  = details.edition_language  || book.language       || '';
        const dispPages     = details.total_pages       || book.page_count     || '';
        const dispFormat    = details.edition_format    || '';

        const modal = document.getElementById('modal-book-detail');

        modal.innerHTML = `
        <div class="modal bd-modal" data-user-book-id="${userBookId}" data-book-id="${bookId}">
            <button class="modal-close-btn" id="book-detail-close">×</button>
            <div class="bd-modal-body">

            <!-- ── HEADER ── -->
            <div class="bd-header">
                <div class="bd-cover-wrap">
                    <img class="bd-cover"
                        src="${book.cover_url || (document.documentElement.getAttribute('data-theme') === 'night' ? 'assets/no-cover-black.svg' : 'assets/no-cover.svg')}"
                        alt="${this._esc(book.title)}"
                        onerror="this.src='assets/no-cover.svg'">
                    <span class="bd-status-badge bd-status-${book.status ?? 'want_to_read'}">
                        ${STATUS_LABELS[book.status] ?? ''}
                    </span>
                    <label class="bd-cover-upload-btn" title="Cambia copertina">
                        📷
                        <input type="file" accept="image/jpeg,image/png,image/webp" style="display:none"
                            id="bd-cover-file-input">
                    </label>
                    ${book.cover_url ? `<button class="bd-cover-remove-btn" id="bd-cover-remove-btn" title="Rimuovi copertina">✕</button>` : ''}
                </div>
                <div class="bd-header-info">
                    <h2 class="bd-title">${this._esc(book.title)}</h2>
                    <p class="bd-author" id="bd-author-display" style="cursor:pointer" title="Clicca per modificare">${this._esc(book.author || 'Autore sconosciuto')}</p>
                    <input type="text" id="bd-author-input" class="bd-text-input hidden" value="${this._esc(book.author || '')}" placeholder="Nome autore" style="margin-top:4px">
                    <div class="bd-pub-pills">
                        ${dispPublisher ? `<span class="bd-pub-pill">🏢 ${this._esc(dispPublisher)}</span>` : ''}
                        ${dispYear      ? `<span class="bd-pub-pill">📅 ${dispYear}</span>` : ''}
                        ${dispPages     ? `<span class="bd-pub-pill">📄 ${dispPages} pag.</span>` : ''}
                        ${dispLanguage  ? `<span class="bd-pub-pill">🌐 ${this._esc(dispLanguage)}</span>` : ''}
                        ${dispFormat    ? `<span class="bd-pub-pill">${this._formatLabel(dispFormat)}</span>` : ''}
                    </div>
                    ${details.series_name ? `
                    <div class="bd-series">
                        <span class="bd-series-icon">◈</span>
                        <span><strong>${this._esc(details.series_name)}</strong>${details.series_volume ? ` · Vol. ${details.series_volume}` : ''}</span>
                    </div>` : ''}
                    ${details.acquisition ? `
                    <div class="bd-acquisition">
                        <span>${ACQ_ICONS[details.acquisition] ?? '📦'}</span>
                        <span>${details.acquisition === 'purchased' ? 'Acquistato' : details.acquisition === 'gift' ? 'Regalo' : 'Altro'}${details.acquisition_note ? ` — ${this._esc(details.acquisition_note)}` : ''}</span>
                    </div>` : ''}
                </div>
            </div>



            <!-- ── STATO E SCAFFALE (solo Collezione) ── -->
            ${!isWishlist ? `
            <div class="bd-status-section">
                <div class="bd-status-group">
                    <span class="bd-field-label">Stato</span>
                    <div class="bd-status-btns">
                        <button class="bd-status-btn${book.status === 'want_to_read' ? ' active' : ''}" data-status="want_to_read">Da leggere</button>
                        <button class="bd-status-btn${book.status === 'reading'      ? ' active' : ''}" data-status="reading">In lettura</button>
                        <button class="bd-status-btn${book.status === 'read'         ? ' active' : ''}" data-status="read">Letto</button>
                    </div>
                </div>
                <div class="bd-shelf-group">
                    <label class="bd-field-label" for="bd-shelf-select">Scaffale</label>
                    <select class="bd-select-input" id="bd-shelf-select">
                        <option value="">— Nessuno —</option>
                        ${this._shelves.map(s => `<option value="${s.id}" ${book.shelf_id == s.id ? 'selected' : ''}>${this._esc(s.name)}</option>`).join('')}
                    </select>
                </div>
            </div>` : ''}

            <!-- ── PROGRESS (non in wishlist) ── -->
            ${!isWishlist ? `
            <div class="bd-progress-section">
                <div class="bd-progress-header">
                    <span class="bd-section-label">Avanzamento lettura</span>
                    <span class="bd-progress-pages">
                        <input class="bd-page-input" type="number" min="0" id="bd-current-page"
                               value="${initCp}" placeholder="0" ${isRead ? 'readonly' : ''}>
                        <span class="bd-page-sep">/</span>
                        <input class="bd-page-input" type="number" min="0" id="bd-total-pages"
                               value="${initTp}" placeholder="???">
                    </span>
                </div>
                <div class="bd-bar-track" role="progressbar"
                     aria-valuenow="${initPct}" aria-valuemin="0" aria-valuemax="100">
                    <div class="bd-bar-fill" style="width:${initPct}%"></div>
                </div>
                <div class="bd-bar-pct">${initPct}%</div>
            </div>` : ''}

            <!-- ── DATE LETTURA (solo Collezione) ── -->
            ${!isWishlist ? `
            <div class="bd-dates-section">
                <div class="bd-dates-row">
                    <div class="bd-date-field">
                        <label class="bd-field-label" for="bd-started-at">Iniziato il</label>
                        <input class="bd-date-input" type="date" id="bd-started-at"
                                value="${details.started_at ?? ''}" max="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="bd-date-arrow">→</div>
                    <div class="bd-date-field">
                        <label class="bd-field-label" for="bd-finished-at">Terminato il</label>
                        <input class="bd-date-input" type="date" id="bd-finished-at"
                                value="${details.finished_at ?? ''}" max="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <p class="bd-duration" id="bd-duration">${this._durationText(details.started_at, details.finished_at)}</p>
            </div>` : ''}

            <!-- ── RECENSIONE (solo Collezione) ── -->
            ${!isWishlist ? `
            <div class="bd-review-section">
                <div class="bd-review-header">
                    <span class="bd-section-label">La tua recensione</span>
                    <div class="bd-stars" id="bd-stars">
                        ${[1,2,3,4,5].map(n => `
                        <span class="bd-star${n <= rating ? ' active' : ''}" data-value="${n}">★</span>`).join('')}
                    </div>
                </div>
                <textarea class="bd-review-textarea" id="bd-review-text"
                        placeholder="Scrivi le tue impressioni…" maxlength="2000"
                        rows="3">${this._esc(book.review_text || '')}</textarea>
                <div class="bd-md-preview" id="bd-review-preview">${marked.parse(book.review_text || '')}</div>
                <p class="bd-char-count"><span id="bd-char-count">${(book.review_text || '').length}</span>/2000</p>
            </div>` : ''}

            <!-- ── NOTE PERSONALI ── -->
            <div class="bd-notes-section">
                <span class="bd-section-label">Note personali</span>
                <textarea class="bd-notes-textarea" id="bd-personal-notes"
                        placeholder="Appunti, citazioni preferite, riflessioni…"
                        rows="3">${this._esc(details.personal_notes || '')}</textarea>
                <div class="bd-md-preview" id="bd-notes-preview">${marked.parse(details.personal_notes || '')}</div>
            </div>

            <!-- ── SERIE + ACQUISIZIONE ── -->
            <div class="bd-extra-section">
                <div class="bd-extra-row">
                    <div class="bd-field-group bd-field-grow">
                        <label class="bd-field-label" for="bd-series-name">Serie</label>
                        <input class="bd-text-input" type="text" id="bd-series-name"
                            value="${this._esc(details.series_name ?? '')}" placeholder="es. Il Trono di Spade">
                    </div>
                    <div class="bd-field-group bd-field-small">
                        <label class="bd-field-label" for="bd-series-volume">Volume</label>
                        <input class="bd-text-input" type="number" step="0.5" min="0" id="bd-series-volume"
                            value="${details.series_volume ?? ''}" placeholder="1">
                    </div>
                </div>
                ${!isWishlist ? `
                <div class="bd-extra-row">
                    <div class="bd-field-group">
                        <label class="bd-field-label" for="bd-acquisition">Acquisizione</label>
                        <select class="bd-select-input" id="bd-acquisition">
                            <option value="">— non specificato —</option>
                            <option value="purchased" ${details.acquisition === 'purchased' ? 'selected' : ''}>🛒 Acquistato</option>
                            <option value="gift"      ${details.acquisition === 'gift'      ? 'selected' : ''}>🎁 Regalo</option>
                            <option value="other"     ${details.acquisition === 'other'     ? 'selected' : ''}>📦 Altro</option>
                        </select>
                    </div>
                    <div class="bd-field-group bd-field-grow">
                        <label class="bd-field-label" for="bd-acquisition-note">Nota acquisizione</label>
                        <input class="bd-text-input" type="text" id="bd-acquisition-note"
                            value="${this._esc(details.acquisition_note ?? '')}" placeholder="es. Regalo di Marco">
                    </div>
                </div>` : ''}
            </div>

            <!-- ── DETTAGLI EDIZIONE ── -->
            <div class="bd-edition-details">
                <div class="bd-edition-summary-static">
                    <span class="bd-section-label">Dettagli edizione</span>
                </div>
                <div class="bd-edition-grid">
                    <div class="bd-field-group">
                        <label class="bd-field-label" for="bd-edition-publisher">Editore</label>
                        <input class="bd-text-input" type="text" id="bd-edition-publisher"
                               value="${this._esc(details.edition_publisher ?? book.publisher ?? '')}"
                               placeholder="es. Mondadori">
                    </div>
                    <div class="bd-field-group">
                        <label class="bd-field-label" for="bd-edition-year">Anno edizione</label>
                        <input class="bd-text-input" type="number" id="bd-edition-year"
                               value="${details.edition_year ?? book.published_year ?? ''}"
                               min="1000" max="2099" placeholder="2024">
                    </div>
                    <div class="bd-field-group">
                        <label class="bd-field-label" for="bd-edition-language">Lingua</label>
                        <input class="bd-text-input" type="text" id="bd-edition-language"
                               value="${this._esc(details.edition_language ?? book.language ?? '')}"
                               placeholder="Italiano">
                    </div>
                    <div class="bd-field-group">
                        <label class="bd-field-label" for="bd-edition-pages">Pagine</label>
                        <input class="bd-text-input" type="number" id="bd-edition-pages"
                               value="${details.total_pages ?? book.page_count ?? ''}"
                               min="1" placeholder="320">
                    </div>
                    <div class="bd-field-group">
                        <label class="bd-field-label" for="bd-edition-label">Etichetta edizione</label>
                        <input class="bd-text-input" type="text" id="bd-edition-label"
                               value="${this._esc(details.edition_label ?? '')}" placeholder="es. Prima edizione">
                    </div>
                    <div class="bd-field-group">
                        <label class="bd-field-label" for="bd-edition-format">Formato</label>
                        <select class="bd-select-input" id="bd-edition-format">
                            <option value="">— non specificato —</option>
                            <option value="paperback"  ${dispFormat === 'paperback'  ? 'selected' : ''}>Brossura</option>
                            <option value="hardcover"  ${dispFormat === 'hardcover'  ? 'selected' : ''}>Copertina rigida</option>
                            <option value="ebook"      ${dispFormat === 'ebook'      ? 'selected' : ''}>E-book</option>
                            <option value="audiobook"  ${dispFormat === 'audiobook'  ? 'selected' : ''}>Audiolibro</option>
                            <option value="other"      ${dispFormat === 'other'      ? 'selected' : ''}>Altro</option>
                        </select>
                    </div>
                    <div class="bd-field-group">
                        <label class="bd-field-label" for="bd-edition-isbn">ISBN edizione</label>
                        <input class="bd-text-input" type="text" id="bd-edition-isbn"
                               value="${this._esc(details.edition_isbn ?? book.isbn ?? '')}"
                               placeholder="978-…">
                    </div>
                </div>
            </div>

            </div><!-- /bd-modal-body -->

            <!-- ── BARRA AZIONI FISSA IN BASSO ── -->
            <div class="bd-actions">
                <div class="bd-actions-left">
                    <button class="btn-danger-sm" id="detail-remove-btn"><img src="assets/icon/cestino.png" alt="" style="width:1.5rem;height:1.5rem;object-fit:contain;vertical-align:middle;margin-right:.3rem;">Rimuovi</button>
                    <button class="btn-move btn-move-to-wishlist${isWishlist ? ' hidden' : ''}"
                            id="detail-move-wishlist"><img src="assets/icon/lista.png" alt="" style="width:1rem;height:1rem;object-fit:contain;vertical-align:middle;margin-right:.3rem;">Lista desideri</button>
                    <button class="btn-move btn-move-to-library${!isWishlist ? ' hidden' : ''}"
                            id="detail-move-library">Collezione</button>
                </div>
                <button class="btn-confirm" id="detail-save-btn">Salva</button>
            </div>

        </div>`;

        this._bindDetailEvents(book, details, userBookId, bookId);
    }

    _bindDetailEvents(book, details, userBookId, bookId) {
        const modal = document.getElementById('modal-book-detail');

        // Chiudi
        modal.querySelector('#book-detail-close')
            .addEventListener('click', () => this._closeModal('modal-book-detail'));

        // ── Upload copertina ───────────────────────────────────
        const fileInput = modal.querySelector('#bd-cover-file-input');
        fileInput?.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('cover', file);
            try {
                const res = await api.uploadCover(userBookId, fd);
                if (res?.data?.cover_url) {
                    modal.querySelector('.bd-cover').src = res.data.cover_url;
                    this.showSuccess('Copertina aggiornata!');
                }
            } catch {
                this.showError('Errore nel caricamento');
            }
        });

        // Rimuovi copertina
        modal.querySelector('#bd-cover-remove-btn')?.addEventListener('click', async () => {
            if (!confirm('Rimuovere la copertina?')) return;
            try {
                await api.updateBook(userBookId, { cover_url: null });
                modal.querySelector('.bd-cover').src = 'assets/no-cover.svg';
                modal.querySelector('#bd-cover-remove-btn')?.remove();
                this.showSuccess('Copertina rimossa!');
            } catch {
                this.showError('Errore nella rimozione');
            }
        });

        // ── Modifica autore inline ─────────────────────────────
        const authorDisplay = modal.querySelector('#bd-author-display');
        const authorInput   = modal.querySelector('#bd-author-input');
        authorDisplay?.addEventListener('click', () => {
            authorDisplay.classList.add('hidden');
            authorInput.classList.remove('hidden');
            authorInput.focus();
            authorInput.select();
        });
        authorInput?.addEventListener('blur', () => {
            authorDisplay.textContent = authorInput.value.trim() || 'Autore sconosciuto';
            authorDisplay.classList.remove('hidden');
            authorInput.classList.add('hidden');
        });

        // ── Progress bar live ──────────────────────────────────
        const cpInput  = modal.querySelector('#bd-current-page');
        const tpInput  = modal.querySelector('#bd-total-pages');
        const barFill  = modal.querySelector('.bd-bar-fill');
        const barPct   = modal.querySelector('.bd-bar-pct');
        const barTrack = modal.querySelector('.bd-bar-track');

        const updateProgress = (forcePct) => {
            const pct = forcePct !== undefined
                ? forcePct
                : (BookDetailPresenter.calcProgress(cpInput?.value, tpInput?.value) ?? 0);
            if (barFill)  barFill.style.width = `${pct}%`;
            if (barPct)   barPct.textContent  = `${pct}%`;
            if (barTrack) barTrack.setAttribute('aria-valuenow', pct);
        };

        if (cpInput && tpInput) {
            cpInput.addEventListener('input', () => updateProgress());
            tpInput.addEventListener('input', () => {
                updateProgress();
                const ep = modal.querySelector('#bd-edition-pages');
                if (ep) ep.value = tpInput.value;
            });
        }

        const epInput = modal.querySelector('#bd-edition-pages');
        if (epInput && tpInput) {
            epInput.addEventListener('input', () => {
                tpInput.value = epInput.value;
                updateProgress();
            });
        }

        // ── Durata lettura live ────────────────────────────────
        const startInput  = modal.querySelector('#bd-started-at');
        const finishInput = modal.querySelector('#bd-finished-at');
        const durationEl  = modal.querySelector('#bd-duration');
        if (startInput && finishInput && durationEl) {
            const upd = () => { durationEl.textContent = this._durationText(startInput.value, finishInput.value); };
            startInput.addEventListener('change', upd);
            finishInput.addEventListener('change', upd);
        }

        // ── Stato lettura: "Letto" → progress 100% ────────────
        modal.querySelectorAll('.bd-status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.bd-status-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (btn.dataset.status === 'read') {
                    // Letto → current_page = total_pages, progress 100%
                    if (cpInput && tpInput?.value) cpInput.value = tpInput.value;
                    cpInput?.setAttribute('readonly', true);
                    updateProgress(100);
                } else {
                    // Non letto → azzera current_page e sblocca input
                    if (cpInput) cpInput.value = '';
                    cpInput?.removeAttribute('readonly');
                    updateProgress(0);
                }
            });
        });

        // ── Stelle recensione ──────────────────────────────────
        let currentRating = book.rating ?? 0;
        const stars = modal.querySelectorAll('.bd-star');
        const paintStars = (n) => stars.forEach(s =>
            s.classList.toggle('active', parseInt(s.dataset.value) <= n));
        stars.forEach(star => {
            star.addEventListener('mouseenter', () => paintStars(parseInt(star.dataset.value)));
            star.addEventListener('mouseleave', () => paintStars(currentRating));
            star.addEventListener('click', () => {
                const v = parseInt(star.dataset.value);
                currentRating = (currentRating === v) ? 0 : v;
                paintStars(currentRating);
            });
        });

        // ── Contatore caratteri ────────────────────────────────
        const textArea  = modal.querySelector('#bd-review-text');
        const charCount = modal.querySelector('#bd-char-count');
        textArea?.addEventListener('input', () => {
            if (charCount) charCount.textContent = textArea.value.length;
        });

        // ── Editor markdown con preview live ──────────────────
        const setupMdField = (taEl, previewEl) => {
            if (!taEl || !previewEl) return;

            let editorSetup = false;

            previewEl.style.display = 'none';

            const showPreview = () => {
                if (!taEl.value.trim()) return;
                previewEl.innerHTML = MarkdownParser.parse(taEl.value);
                taEl.style.display = 'none';
                previewEl.style.display = 'block';
            };

            const showEditor = () => {
                previewEl.style.display = 'none';
                taEl.style.display = 'block';
                // Inizializza MarkdownEditor solo la prima volta che la textarea diventa visibile
                if (!editorSetup) {
                    editorSetup = true;
                    MarkdownEditor.setup(taEl, () => {
                        previewEl.innerHTML = MarkdownParser.parse(taEl.value);
                    });
                }
                taEl.focus();
            };

            previewEl.addEventListener('click', showEditor);
            taEl.addEventListener('blur', showPreview);

            // Se non c'è contenuto, mostra subito la textarea con editor pronto
            if (!taEl.value.trim()) {
                showEditor();
            } else {
                showPreview();
            }
        };
        setupMdField(
            modal.querySelector('#bd-review-text'),
            modal.querySelector('#bd-review-preview')
        );
        setupMdField(
            modal.querySelector('#bd-personal-notes'),
            modal.querySelector('#bd-notes-preview')
        );

        const taReview = modal.querySelector('#bd-review-text');
        const taNotes  = modal.querySelector('#bd-personal-notes');

        // ── Sposta ────────────────────────────────────────────
        modal.querySelector('#detail-move-wishlist')?.addEventListener('click', async () => {
            await api.updateBook(userBookId, { is_wishlist: true });
            this._closeModal('modal-book-detail');
            this.showSuccess('Spostato in lista desideri!');
            this._loadCurrentView();
        });
        modal.querySelector('#detail-move-library')?.addEventListener('click', async () => {
            await api.updateBook(userBookId, { is_wishlist: false, status: 'want_to_read' });
            this._closeModal('modal-book-detail');
            this.showSuccess('Spostato in Collezione!');
            this._loadCurrentView();
        });

        // ── Rimuovi ───────────────────────────────────────────
        modal.querySelector('#detail-remove-btn').addEventListener('click', async () => {
            if (!confirm('Rimuovere questo libro dalla collezione?')) return;
            await this.bookPresenter.removeBook(userBookId);
            this._closeModal('modal-book-detail');
        });

        // ── Salva ─────────────────────────────────────────────
        modal.querySelector('#detail-save-btn').addEventListener('click', async () => {
            const saveBtn = modal.querySelector('#detail-save-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Salvataggio…';

            try {
                // 1. book_details (usa userBookId = user_books.id)
                const totalPages  = tpInput?.value || modal.querySelector('#bd-edition-pages')?.value || null;
                const currentPage = cpInput?.value || null;

                // Usa document per sicurezza — i campi stanno dentro .bd-modal-body
                const $ = (id) => document.getElementById(id)?.value ?? null;
                const $v = (id) => document.getElementById(id)?.value || null;

                const detailPayload = {
                    current_page:      currentPage,
                    total_pages:       totalPages,
                    started_at:        $v('bd-started-at'),
                    finished_at:       $v('bd-finished-at'),
                    series_name:       $v('bd-series-name'),
                    series_volume:     $v('bd-series-volume'),
                    acquisition:       $v('bd-acquisition'),
                    acquisition_note:  $v('bd-acquisition-note'),
                    edition_publisher: $v('bd-edition-publisher'),
                    edition_year:      $v('bd-edition-year'),
                    edition_language:  $v('bd-edition-language'),
                    edition_label:     $v('bd-edition-label'),
                    edition_format:    $v('bd-edition-format'),
                    edition_isbn:      $v('bd-edition-isbn'),
                    personal_notes:    $('bd-personal-notes'),  // ?? null: stringa vuota è valida
                };
                await this.bookDetailPresenter.saveDetails(userBookId, detailPayload);

                // 2. Recensione (l'endpoint vuole user_books.id, risolve internamente books.id)
                const reviewText = modal.querySelector('#bd-review-text')?.value?.trim() || null;
                if (currentRating > 0 || reviewText) {
                    await api.upsertReview(userBookId, { rating: currentRating, review_text: reviewText });
                } else {
                    await api.deleteReview(userBookId);
                }

                // 3. Stato / scaffale — l'endpoint vuole user_books.id
                const isWishlist = this._activeSection === 'wishlist';
                if (!isWishlist) {
                    const status  = modal.querySelector('.bd-status-btn.active')?.dataset.status;
                    const shelfId = modal.querySelector('#bd-shelf-select')?.value || null;
                    const updates = {};
                    if (status  && status   !== book.status)     updates.status   = status;
                    if (shelfId !== String(book.shelf_id ?? '')) updates.shelf_id = shelfId;
                    if (Object.keys(updates).length) await api.updateBook(userBookId, updates);
                }

                // 4. Autore — aggiorna books.author se modificato
                const author = modal.querySelector('#bd-author-input')?.value.trim() || null;
                if (author && author !== book.author) {
                    await api.patchBook(userBookId, { author });
                }

                this.bookDetailPresenter.invalidate(userBookId);
                this._closeModal('modal-book-detail');
                this.showSuccess('Salvato!');
                this._loadCurrentView();
            } catch (err) {
                this.showError('Errore nel salvataggio');
                console.error(err);
            } finally {
                saveBtn.disabled    = false;
                saveBtn.textContent = 'Salva';
            }
        });

        // Backdrop
        modal.addEventListener('click', e => {
            if (e.target === modal) this._closeModal('modal-book-detail');
        });
    }


    // ── Reset scan modal ──────────────────────────────────────

    _resetScanModal() {
        this._editingBook = null;
        document.getElementById('scan-preview')?.classList.add('hidden');
        document.getElementById('scan-not-found')?.classList.add('hidden');
        document.getElementById('scan-error').textContent = '';
        document.getElementById('scan-manual-isbn').value = '';
        document.getElementById('scan-isbn-display').textContent = '—';
        document.querySelectorAll('.destination-btn:not(.manual-dest-btn)').forEach((b, i) => b.classList.toggle('active', i === 1));
        document.getElementById('library-options')?.classList.add('hidden');
        document.getElementById('scan-method-choice').classList.remove('hidden');
        document.getElementById('scan-camera-section').classList.add('hidden');
        document.getElementById('scan-series-name').value = '';
        document.getElementById('scan-series-volume').value = '';
    }

    _resetManualModal() {
        ['manual-title','manual-author','manual-publisher','manual-year','manual-isbn']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.querySelectorAll('.manual-dest-btn').forEach((b, i) => b.classList.toggle('active', i === 1));
        document.getElementById('manual-library-options')?.classList.add('hidden');
        document.getElementById('manual-series-name').value = '';
        document.getElementById('manual-series-volume').value = '';
    }

    _renderCategoryCheckboxes() {
        const wrap = document.getElementById('scan-cats-wrap');
        if (wrap) wrap.innerHTML = '';
    }

    // ── Scanner ───────────────────────────────────────────────

    _openScanModal() {
        this._resetScanModal();
        this._openModal('modal-scan');
        this._renderShelfSelectInModal();
    }

    _openManualModal(prefillIsbn = '') {
        this._resetManualModal();
        const sel = document.getElementById('manual-shelf-select');
        if (sel) sel.innerHTML = `<option value="">— Nessuno —</option>` +
            this._shelves.map(s => `<option value="${s.id}">${this._esc(s.name)}</option>`).join('');
        // Precompila ISBN se proveniente dallo scanner
        if (prefillIsbn) {
            const isbnField = document.getElementById('manual-isbn');
            if (isbnField) isbnField.value = prefillIsbn;
        }
        this._openModal('modal-manual');
    }

    _startScanner() {
        const video = document.getElementById('scanner-video');
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
            ZXing.BarcodeFormat.EAN_13,
            ZXing.BarcodeFormat.EAN_8,
        ]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        const codeReader = new ZXing.BrowserMultiFormatReader(hints, 500);
        this._codeReader = codeReader;

        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width:  { ideal: 1920 },
                height: { ideal: 1080 },
            }
        }).then(stream => {
            this._stream = stream;
            video.srcObject = stream;
            video.play();

            // Forza autofocus su Android/Xiaomi
            const track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities?.() ?? {};
            const constraints = { advanced: [] };
            if (capabilities.focusMode?.includes('continuous')) {
                constraints.advanced.push({ focusMode: 'continuous' });
            }
            if (capabilities.focusDistance) {
                constraints.advanced.push({ focusDistance: capabilities.focusDistance.min });
            }
            if (constraints.advanced.length) {
                track.applyConstraints(constraints).catch(() => {});
            }

            // Lettura in tempo reale
            codeReader.decodeFromStream(stream, video, (result, err) => {
                if (result) {
                    const code = result.getText();
                    document.getElementById('scan-isbn-display').textContent = code;
                    document.getElementById('scan-manual-isbn').value = code;
                    this.bookPresenter.lookupIsbn(code);
                    codeReader.reset();

                    // Torna allo stato iniziale: nascondi video, mostra bottone fotocamera
                    this._stopScanner();
                    document.getElementById('scan-camera-section').classList.add('hidden');
                    document.getElementById('scan-method-choice').classList.remove('hidden');
                }
            });

            // Tap per mettere a fuoco
            video.addEventListener('click', async (e) => {
                try {
                    const rect = video.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const y = (e.clientY - rect.top) / rect.height;
                    await track.applyConstraints({
                        advanced: [{ focusMode: 'manual', pointsOfInterest: [{ x, y }] }]
                    });
                    setTimeout(() => {
                        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
                    }, 1500);
                } catch (_) {}
            });

            // Scatta foto e leggi con ZXing sull'immagine
            document.getElementById('scan-capture-btn').addEventListener('click', async () => {
                const canvas = document.getElementById('scan-canvas');
                const ctx    = canvas.getContext('2d');
                canvas.width  = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);

                document.getElementById('scan-isbn-display').textContent = '⏳ Lettura…';

                // Prova prima sull'immagine intera, poi su crop centrale
                const attempts = [
                    { x: 0, y: 0, w: canvas.width, h: canvas.height },
                    { x: Math.floor(canvas.width * 0.1), y: Math.floor(canvas.height * 0.3),
                    w: Math.floor(canvas.width * 0.8), h: Math.floor(canvas.height * 0.5) },
                    { x: Math.floor(canvas.width * 0.2), y: Math.floor(canvas.height * 0.5),
                    w: Math.floor(canvas.width * 0.6), h: Math.floor(canvas.height * 0.4) },
                ];

                for (const crop of attempts) {
                    try {
                        const cropCanvas = document.createElement('canvas');
                        cropCanvas.width  = crop.w;
                        cropCanvas.height = crop.h;
                        cropCanvas.getContext('2d').drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

                        const imageData = cropCanvas.getContext('2d').getImageData(0, 0, crop.w, crop.h);
                        const staticHints = new Map();
                        staticHints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
                            ZXing.BarcodeFormat.EAN_13,
                            ZXing.BarcodeFormat.EAN_8,
                        ]);
                        staticHints.set(ZXing.DecodeHintType.TRY_HARDER, true);
                        const reader = new ZXing.MultiFormatReader(staticHints);
                        const luminanceSource = new ZXing.RGBLuminanceSource(imageData.data, crop.w, crop.h);
                        const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
                        const result = reader.decode(binaryBitmap);
                        const code = result.getText();
                        document.getElementById('scan-isbn-display').textContent = code;
                        document.getElementById('scan-manual-isbn').value = code;
                        this.bookPresenter.lookupIsbn(code);
                        codeReader.reset();
                        return; // trovato, esci
                    } catch (e) {
                        // prova il crop successivo
                    }
                }

                document.getElementById('scan-isbn-display').textContent = '—';
                this.showError('ISBN non trovato — avvicinati al codice e riprova');
            });

        }).catch(err => console.error('Camera error:', err));
    }

    _stopScanner() {
        if (this._codeReader) {
            this._codeReader.reset();
            this._codeReader = null;
        }
        if (this._stream) {
            this._stream.getTracks().forEach(t => t.stop());
            this._stream = null;
        }
    }

    // ── Helpers privati ───────────────────────────────────────

    _esc(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _formatLabel(format) {
        const map = {
            paperback:  '📖 Brossura',
            hardcover:  '📕 Copertina rigida',
            ebook:      '📱 E-book',
            audiobook:  '🎧 Audiolibro',
            other:      '📦 Altro',
        };
        return map[format] ?? format;
    }

    _durationText(startStr, finishStr) {
        if (!startStr || !finishStr) return '';
        const s = new Date(startStr), f = new Date(finishStr);
        if (isNaN(s) || isNaN(f) || f < s) return '';
        const days = Math.round((f - s) / 86400000);
        if (days === 0) return '⏱ Letto in un giorno';
        if (days < 7)   return `⏱ Letto in ${days} giorn${days === 1 ? 'o' : 'i'}`;
        const weeks = Math.round(days / 7);
        if (weeks < 5)  return `⏱ Letto in ${weeks} settiman${weeks === 1 ? 'a' : 'e'}`;
        const months = Math.round(days / 30);
        return `⏱ Letto in circa ${months} mes${months === 1 ? 'e' : 'i'}`;
    }

    // ── Ricerca globale ───────────────────────────────────────

    async _searchAll(query) {
        try {
            const isWishlist = this._activeSection === 'wishlist';
            const shelfId = (!isWishlist && this._activeShelfIndex > 0)
                ? (this._shelves[this._activeShelfIndex - 1]?.id ?? null)
                : null;

            const res   = await api.searchBooks(query, shelfId, isWishlist);
            const books = res?.books ?? [];
            this._renderBookGrid(books);
        } catch (e) {
            this.showError('Errore nella ricerca');
        }
    }

    _renderSearchResults(books, query) {
        const grid = document.getElementById('book-grid');

        if (!books.length) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>Nessun risultato per "<strong>${this._esc(query)}</strong>"</p>
                </div>`;
            return;
        }

        grid.innerHTML = books.map(b => {
            const stars    = b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '☆☆☆☆☆';
            const section  = b.is_wishlist ? 'Lista desideri' : 'Collezione';
            const shelf    = b.shelf_name  ? ` · ${this._esc(b.shelf_name)}` : '';
            return `
            <article class="book-card" data-book='${JSON.stringify({
                id:             b.id,
                user_book_id:   b.user_book_id,
                title:          b.title,
                author:         b.author,
                publisher:      b.publisher      ?? null,
                published_year: b.published_year ?? null,
                page_count:     b.page_count     ?? null,
                language:       b.language       ?? null,
                isbn:           b.isbn           ?? null,
                cover_url:      b.cover_url,
                status:         b.status,
                shelf_id:       b.shelf_id,
                rating:         b.rating,
                review_text:    b.review_text,
                is_wishlist:    b.is_wishlist
            }).replace(/'/g, "&#39;")}'>
                <div class="book-cover-wrap">
                    <img class="book-cover"
                         src="${b.cover_url || 'assets/no-cover.svg'}"
                         alt="${this._esc(b.title)}" loading="lazy">
                </div>
                <div class="book-info">
                    <h3 class="book-title">${this._esc(b.title)}</h3>
                    <p class="book-author">${this._esc(b.author || 'Autore sconosciuto')}</p>
                    <p class="book-stars">${stars}</p>
                    <p class="book-search-badge">${section}${shelf}</p>
                </div>
            </article>`;
        }).join('');

        grid.querySelectorAll('.book-card').forEach(card => {
            card.addEventListener('click', () => {
                const book = JSON.parse(card.dataset.book);
                this._navigateToBook(book);
            });
        });
    }

    // Naviga alla sezione e allo scaffale del libro, poi apre il modal
    async _navigateToBook(book) {
        const section = book.is_wishlist ? 'wishlist' : 'library';

        // Cambia sezione se necessario
        // if (this._activeSection !== section) {
        //     this._activeSection = section;
        //     document.querySelectorAll('.nav-section').forEach(el =>
        //         el.classList.toggle('active', el.dataset.section === section));
        //     const isWishlist = section === 'wishlist';
        //     document.getElementById('shelf-pills').classList.toggle('hidden', isWishlist);
        //     document.getElementById('shelf-arrows').classList.toggle('hidden', isWishlist);
        //     document.getElementById('section-header').textContent =
        //         isWishlist ? '🔖 Lista desideri' : 'Collezione';
        // }

        // Porta allo scaffale corretto (solo in Collezione)
        if (!book.is_wishlist && book.shelf_id) {
            const idx = this._shelves.findIndex(s => s.id == book.shelf_id);
            if (idx !== -1) {
                this._activeShelfIndex = idx + 1; // +1 perché 0 = "Tutti"
                this._lastShelfIndex   = this._activeShelfIndex;
            }
        } else if (!book.is_wishlist && !book.shelf_id) {
            // Nessuno scaffale → "Tutti"
            this._activeShelfIndex = 0;
            this._lastShelfIndex   = 0;
        }

        // Svuota la ricerca e aggiorna la griglia con la vista corretta
        document.getElementById('search-input').value = '';
        this._renderShelfPills();
        this._loadCurrentView();

        // Apre la scheda dopo un tick — lascia il tempo alla griglia di aggiornarsi
        await this._openBookDetail(book);
    }

    // ── Events statici ────────────────────────────────────────

    _bindStaticEvents() {
        // ── Auth: step 1 — richiesta codice OTP ─────────────────
        // Serve un form con: #auth-email, #auth-username (solo registrazione,
        // dentro #auth-username-group), pulsante submit dentro #auth-form-request.
        document.getElementById('auth-form-request')?.addEventListener('submit', async e => {
            e.preventDefault();
            const isLogin = document.getElementById('auth-mode').dataset.mode === 'login';
            const email   = document.getElementById('auth-email').value.trim();
            if (!email) { this.showError('Inserisci la tua email'); return; }

            if (isLogin) {
                await this.authPresenter.requestLoginCode(email);
            } else {
                const username = document.getElementById('auth-username').value.trim();
                if (!username) { this.showError('Il nome utente è obbligatorio'); return; }
                await this.authPresenter.requestRegistrationCode(username, email);
            }
        });

        // ── Auth: step 2 — verifica codice ricevuto via email ───
        // Serve un form con #auth-code dentro #auth-form-verify, e un
        // pulsante #auth-back-btn per tornare allo step 1 (es. email sbagliata).
        document.getElementById('auth-form-verify')?.addEventListener('submit', async e => {
            e.preventDefault();
            const code = document.getElementById('auth-code').value.trim();
            if (!code) { this.showError('Inserisci il codice ricevuto'); return; }
            await this.authPresenter.verifyCode(
                this._pendingAuthEmail,
                code,
                this._pendingAuthUsername
            );
        });
        document.getElementById('auth-back-btn')?.addEventListener('click', () => {
            document.getElementById('auth-step-verify')?.classList.add('hidden');
            document.getElementById('auth-step-request')?.classList.remove('hidden');
            document.getElementById('auth-code').value = '';
        });

        // Toggle login/registrazione
        document.getElementById('auth-toggle').addEventListener('click', () => {
            const el   = document.getElementById('auth-mode');
            const mode = el.dataset.mode === 'login' ? 'register' : 'login';
            el.dataset.mode = mode;
            document.getElementById('auth-btn').textContent    = mode === 'login' ? 'Invia codice' : 'Registrati';
            document.getElementById('auth-toggle').textContent = mode === 'login' ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi';
            document.getElementById('auth-username-group').classList.toggle('hidden', mode === 'login');
        });
        document.getElementById('btn-logout').addEventListener('click', () => this.authPresenter.logout());

        // Stat card come filtro status
        const statFilters = [
            { id: 'stat-total',   status: null },
            { id: 'stat-want',    status: 'want_to_read' },
            { id: 'stat-reading', status: 'reading' },
            { id: 'stat-read',    status: 'read' },
        ];
        statFilters.forEach(({ id, status }) => {
            document.getElementById(id)?.closest('.stat-card')?.addEventListener('click', () => {
                if (this._activeSection === 'wishlist') return; // non applicabile in wishlist
                // Toggle: se già attivo, deseleziona
                this._activeStatus = (this._activeStatus === status) ? null : status;
                this._loadCurrentView();
            });
        });

        // Nav sections
        document.querySelectorAll('.nav-section').forEach(el =>
            el.addEventListener('click', () => this._switchSection(el.dataset.section)));

        // Carousel arrows
        document.getElementById('shelf-prev').addEventListener('click', () => {
            if (this._activeShelfIndex > 0) {
                this._activeShelfIndex--;
                this._lastShelfIndex   = this._activeShelfIndex;
                this._activeStatus     = null;
                this._renderShelfPills();
                this._loadCurrentView();
            }
        });
        document.getElementById('shelf-next').addEventListener('click', () => {
            if (this._activeShelfIndex < this._shelves.length) {
                this._activeShelfIndex++;
                this._lastShelfIndex   = this._activeShelfIndex;
                this._activeStatus     = null;
                this._renderShelfPills();
                this._loadCurrentView();
            }
        });

        // Swipe orizzontale per cambiare scaffale su mobile
        let touchStartX = 0;
        let touchStartY = 0;
        const mainContent = document.querySelector('.main-content');
        mainContent?.addEventListener('touchstart', e => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        mainContent?.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
            if (window.innerWidth > 768) return;

            const grid = document.getElementById('book-grid');

            if (dx < 0 && this._activeShelfIndex < this._shelves.length) {
                this._activeShelfIndex++;
                this._lastShelfIndex = this._activeShelfIndex;
                this._activeStatus   = null;
                this._renderShelfPills();
                this._loadCurrentView();
                grid.classList.remove('book-grid--slide-left', 'book-grid--slide-right');
                void grid.offsetWidth; // forza reflow
                grid.classList.add('book-grid--slide-right');
            } else if (dx > 0 && this._activeShelfIndex > 0) {
                this._activeShelfIndex--;
                this._lastShelfIndex = this._activeShelfIndex;
                this._activeStatus   = null;
                this._renderShelfPills();
                this._loadCurrentView();
                grid.classList.remove('book-grid--slide-left', 'book-grid--slide-right');
                void grid.offsetWidth;
                grid.classList.add('book-grid--slide-left');
            }
        }, { passive: true });

        // Search — globale su tutta la collezione
        let searchTimer;
        document.getElementById('search-input').addEventListener('input', e => {
            clearTimeout(searchTimer);
            const q = e.target.value.trim();
            if (!q) {
                // Query vuota: ripristina la vista normale
                this._loadCurrentView();
                return;
            }
            searchTimer = setTimeout(() => this._searchAll(q), 350);
        });

        // Pulsante aggiungi
        document.getElementById('btn-scan').addEventListener('click', () => this._openModal('modal-add-choice'));
        document.getElementById('btn-open-scan').addEventListener('click', () => {
            this._closeModal('modal-add-choice');
            this._openScanModal();
        });
        document.getElementById('btn-open-manual').addEventListener('click', () => {
            this._closeModal('modal-add-choice');
            this._openManualModal();
        });

        // Destination choice — scan modal
        document.querySelectorAll('.destination-btn:not(.manual-dest-btn)').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.destination-btn:not(.manual-dest-btn)').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('library-options').classList.toggle('hidden', btn.dataset.dest === 'wishlist');
            });
        });

        // Destination choice — manual modal
        document.querySelectorAll('.manual-dest-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.manual-dest-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('manual-library-options').classList.toggle('hidden', btn.dataset.dest === 'wishlist');
            });
        });

        document.getElementById('scan-manual-btn').addEventListener('click', () => {
            const isbn = document.getElementById('scan-manual-isbn').value.trim();
            if (!isbn) return;
            document.getElementById('scan-isbn-display').textContent = '⏳';
            document.getElementById('scan-manual-btn').disabled = true;
            this.bookPresenter.lookupIsbn(isbn);
        });
        // Scelta metodo nel modal scan
        document.getElementById('scan-use-camera').addEventListener('click', () => {
            document.getElementById('scan-method-choice').classList.add('hidden');
            document.getElementById('scan-camera-section').classList.remove('hidden');
            this._startScanner();
        });

        // Pulsante "Aggiungi manualmente" nel blocco not-found del modal scan
        document.getElementById('scan-add-manually-btn')?.addEventListener('click', () => {
            // Prende l'ISBN già digitato e lo passa al modal manuale
            const isbn = document.getElementById('scan-manual-isbn')?.value.trim()
                      || document.getElementById('scan-isbn-display')?.textContent?.trim();
            this._closeModal('modal-scan');
            this._stopScanner();
            this._resetScanModal();
            this._openManualModal(isbn !== '—' ? isbn : '');
        });
        document.getElementById('scan-manual-isbn').addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('scan-manual-btn').click();
        });

        // Confirm scan
        document.getElementById('scan-confirm-btn').addEventListener('click', async () => {
            if (!this._editingBook) { this.showError('Cerca prima un libro tramite ISBN'); return; }
            const dest       = document.querySelector('.destination-btn:not(.manual-dest-btn).active')?.dataset.dest ?? 'wishlist';
            const isWishlist = dest === 'wishlist';
            const status     = isWishlist ? 'want_to_read' : document.getElementById('scan-status-select').value;
            const shelfId    = isWishlist ? null : (document.getElementById('scan-shelf-select').value || null);
            await this.bookPresenter.addBook(this._editingBook, status, shelfId, isWishlist);
        });
        document.getElementById('scan-cancel-btn').addEventListener('click', () => {
            this._closeModal('modal-scan'); this._stopScanner(); this._resetScanModal();
        });

        // Confirm manual
        document.getElementById('manual-confirm-btn').addEventListener('click', async () => {
            const bookData = this.getManualBookData();
            if (!bookData.title) { this.showError('Il titolo è obbligatorio'); return; }
            const dest       = document.querySelector('.manual-dest-btn.active')?.dataset.dest ?? 'wishlist';
            const isWishlist = dest === 'wishlist';
            const status     = isWishlist ? 'want_to_read' : document.getElementById('manual-status-select').value;
            const shelfId    = isWishlist ? null : (document.getElementById('manual-shelf-select').value || null);
            await this.bookPresenter.addBook(bookData, status, shelfId, isWishlist);
        });
        document.getElementById('manual-cancel-btn').addEventListener('click', () => {
            this._closeModal('modal-manual'); this._resetManualModal();
        });

        // Click sul nome scaffale → apre modal
        document.getElementById('shelf-current-name').addEventListener('click', () => {
            const nameEl = document.getElementById('shelf-current-name');
            if (!nameEl.dataset.shelfId) return;
            this._openShelfModal(nameEl.dataset.shelfId, nameEl.dataset.shelfName);
        });

        // Shelf modal
        document.getElementById('shelf-save-btn').addEventListener('click', () => {
            const name   = document.getElementById('shelf-name-input').value.trim();
            const editId = document.getElementById('shelf-save-btn').dataset.editId;
            if (!name) return;
            if (editId) this.shelfPresenter.update(editId, name);
            else        this.shelfPresenter.create(name);
        });
        document.getElementById('shelf-cancel-btn').addEventListener('click', () => this._closeModal('modal-shelf'));
        document.getElementById('shelf-delete-btn').addEventListener('click', async () => {
            const id    = document.getElementById('shelf-delete-btn').dataset.shelfId;
            const name  = document.getElementById('shelf-name-input').value.trim();
            const label = name ? `"${name}"` : 'questo scaffale';
            if (!id || !confirm(`Eliminare ${label}? I libri non verranno eliminati.`)) return;
            this._closeModal('modal-shelf');
            await this.shelfPresenter.delete(id);
            this._activeShelfIndex = 0;
            this._lastShelfIndex   = 0;
        });

        // Review modal standalone
        document.querySelectorAll('.star-rating .star').forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.dataset.value);
                document.querySelectorAll('.star-rating .star').forEach(s =>
                    s.classList.toggle('selected', parseInt(s.dataset.value) <= val));
            });
        });
        document.getElementById('review-save-btn')?.addEventListener('click', () => {
            const rating = document.querySelectorAll('.star-rating .star.selected').length;
            const text   = document.getElementById('review-text').value.trim();
            if (!rating) { this.showError('Seleziona almeno una stella'); return; }
            this.bookPresenter.upsertReview(this._reviewBookId, rating, text);
        });
        document.getElementById('review-delete-btn')?.addEventListener('click', () =>
            this.bookPresenter.deleteReview(this._reviewBookId));
        document.getElementById('review-cancel-btn')?.addEventListener('click', () =>
            this._closeModal('modal-review'));

        // Backdrop per modali statici
        ['modal-scan','modal-manual','modal-shelf','modal-review','modal-add-choice','modal-reorder'].forEach(id => {
            const m = document.getElementById(id);
            m?.addEventListener('click', e => {
                if (e.target === m) {
                    m.classList.add('hidden');
                    this._stopScanner();
                    this._resetScanModal();
                }
            });
        });
        
        // Menu hamburger
        const hamburgerBtn  = document.getElementById('hamburger-btn');
        const hamburgerMenu = document.getElementById('hamburger-menu');
        hamburgerBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            hamburgerMenu.classList.toggle('hidden');
        });
        document.addEventListener('click', () => hamburgerMenu?.classList.add('hidden'));
        document.getElementById('menu-add-shelf')?.addEventListener('click', (e) => {
            e.stopPropagation();
            hamburgerMenu.classList.add('hidden');
            this._openShelfModal(null, '');
        });
        document.getElementById('menu-theme')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const current = localStorage.getItem('sageshelf-theme');
            this._applyTheme(current === 'night' ? 'default' : 'night');
            hamburgerMenu.classList.add('hidden');
        });

        document.getElementById('menu-reorder')?.addEventListener('click', () => {
            hamburgerMenu.classList.add('hidden');
            this._openReorderModal();
        });
        document.getElementById('sort-by-title')?.addEventListener('click', () => this._sortBooks('title'));
        document.getElementById('sort-by-author')?.addEventListener('click', () => this._sortBooks('author'));
        document.getElementById('sort-by-added-asc')?.addEventListener('click',  () => this._sortBooks('added_asc'));
        document.getElementById('sort-by-added-desc')?.addEventListener('click', () => this._sortBooks('added_desc'));
        document.getElementById('reorder-cancel-btn')?.addEventListener('click', () => 
            this._closeModal('modal-reorder'));

        document.getElementById('sort-by-custom')?.addEventListener('click', () => {
            this._dragEnabled = true;
            this._closeModal('modal-reorder');
            this.showSuccess('Trascina le card per riordinare!');
            document.getElementById('exit-drag-btn')?.classList.remove('hidden');
            this._loadCurrentView();
        });
        document.getElementById('exit-drag-btn')?.addEventListener('click', () => {
            this._dragEnabled = false;
            document.getElementById('exit-drag-btn').classList.add('hidden');
            this._loadCurrentView();
        });

        // Toggle visibilità password
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById(btn.dataset.target);
                if (!input) return;
                input.type = input.type === 'password' ? 'text' : 'password';
                btn.textContent = input.type === 'password' ? '👁' : '🙈';
            });
        });
    }

    _applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme === 'night' ? 'night' : 'default');
        localStorage.setItem('sageshelf-theme', theme);
        // Aggiorna le copertine mancanti
        const noCover = theme === 'night'
            ? 'assets/no-cover-black.svg'
            : 'assets/no-cover.svg';
        document.querySelectorAll('.book-cover, .bd-cover').forEach(img => {
            if (img.src.includes('no-cover')) img.src = noCover;
        });
    }

    _loadTheme() {
        const saved = localStorage.getItem('sageshelf-theme');
        if (saved === 'night') this._applyTheme('night');
    }

    _openReorderModal() {
        const modal = document.getElementById('modal-reorder');
        if (!modal) return;
        this._openModal('modal-reorder');
    }
    async _sortBooks(by) {
        const shelfId = this._activeShelfIndex > 0
            ? this._shelves[this._activeShelfIndex - 1]?.id
            : null;
        if (!shelfId) {
            await api.sortAllBooks(by);
        } else {
            await api.sortBooks(shelfId, by);
            if (this._shelves[this._activeShelfIndex - 1]) {
                this._shelves[this._activeShelfIndex - 1].sort_by = by;
            }
        }
        this._closeModal('modal-reorder');
        const labels = {
            title: 'titolo', author: 'autore',
            added_asc: 'prima aggiunta', added_desc: 'ultima aggiunta'
        };
        this.showSuccess(`Scaffale ordinato per ${labels[by] ?? by}!`);
        this._loadCurrentView();
    }
}

window.AppView = AppView;