# 📚 SageShelf — MVP Web App

Applicazione web per gestire la propria collezione di libri, strutturata secondo il pattern **MVP (Model-View-Presenter)** con gerarchia di ereditarietà sia nel frontend che nel backend.

---

## Stack tecnologico

| Layer     | Tecnologia                                                        |
|-----------|-------------------------------------------------------------------|
| Frontend  | HTML5, CSS3 (custom), JavaScript ES2022 (no framework)            |
| Backend   | PHP 8.1+                                                          |
| Database  | MySQL 8+ (o MariaDB 10.6+)                                        |
| Auth      | Passwordless via codice OTP inviato per email (Resend API)        |
| Scanner   | Tesseract.js (OCR ISBN via webcam)                                |
| Book API  | Google Books → Open Library (lookup ISBN, cascata automatica)     |
| Markdown  | marked.js + DOMPurify (recensioni e note personali)               |

---

## Struttura del progetto (MVP)

```
bookshelf/
├── .gitignore
├── backend/
│   ├── .env                        
│   ├── config/
│   │   ├── bootstrap.php           # Autoload, sessione, CORS, helpers HTTP, invio email
│   │   ├── Database.php            # Singleton PDO (config da variabili d'ambiente)
│   │   └── schema.sql              # Schema DB completo (installazione fresh)
│   ├── models/                     # ← MODEL: accesso dati puro
│   │   ├── BookDetailModel.php
│   │   ├── BookModel.php
│   │   ├── LoginCodeModel.php      # Codici OTP (creazione, verifica, rate limiting)
│   │   ├── ReviewModel.php
│   │   ├── ShelfModel.php
│   │   └── UserModel.php
│   ├── presenters/                 # ← PRESENTER: logica di business
│   │   ├── AuthPresenter.php       # Richiesta/verifica codice OTP, sessione
│   │   ├── BookDetailPresenter.php
│   │   ├── BookPresenter.php
│   │   ├── CategoryPresenter.php
│   │   └── ShelfPresenter.php
│   ├── views/
│   │   └── api.php                 # ← VIEW: dispatcher HTTP (thin layer)
│   └── .htaccess
│
└── frontend/
    ├── assets/
    │   ├── icon/
    │   │   ├── cestino.png
    │   │   ├── fotocamera.png
    │   │   ├── lente.png
    │   │   ├── lista.png
    │   │   ├── matita.png
    │   │   └──  tema.png  
    │   ├── avatars/                # Immagini profilo utente
    │   ├── covers/                 # Copertine caricate manualmente
    │   ├── no-cover-black.svg
    │   └── no-cover.svg
    ├── css/
    │   ├── auth.css
    │   ├── base.css
    │   ├── book-detail.css
    │   ├── books.css
    │   ├── layout.css
    │   ├── modals.css
    │   ├── navbar.css
    │   ├── profile.css
    │   └── style.css
    ├── img/
    │   ├── collezione.png
    │   ├── libro.png
    │   ├── profilo.png
    │   └── lista_desideri.png
    ├── js/
    │   ├── models/
    │   │   ├── ApiModel.js         # ← MODEL: estende BaseModel, tutti gli endpoint
    │   │   └── BaseModel.js        # ← MODEL BASE: fetch HTTP (_get/_post/_put/_del)
    │   ├── presenters/
    │   │   ├── AuthPresenter.js    # ← estende BasePresenter
    │   │   ├── BasePresenter.js    # ← PRESENTER BASE: _run(), _runWithLoading()
    │   │   ├── BookDetailPresenter.js
    │   │   ├── BookPresenter.js    # ← estende BasePresenter
    │   │   └── ShelfPresenter.js   # ← estende BasePresenter
    │   ├── utils/
    │   │   ├── MarkdownEditor.js   # Auto-pairing, liste automatiche
    │   │   └── MarkdownParser.js   # marked.js + DOMPurify
    │   └── views/
    │       ├── AppView.js          # ← estende BaseView, rendering + eventi DOM
    │       ├── BaseView.js         # ← VIEW BASE: toast, loading, modal, helpers
    │       ├── BookDetailView.js   # ← pagina standalone book-detail.html
    │       └── ProfileView.js      # ← pagina profilo utente
    ├── index.html                  # ← VIEW: UI principale
    ├── logo.jpg
    ├── reset-password.html
    └── profile.html                # Pagina profilo utente
```

---

## Setup

### 1. Requisiti
- PHP 8.1+
- MySQL 8+ o MariaDB 10.6+
- Apache con `mod_rewrite` abilitato (XAMPP consigliato per sviluppo locale)
- Un account [Resend](https://resend.com) (gratuito) per l'invio dei codici OTP via email

### 2. Database
Apri `http://localhost/phpmyadmin`, crea il database `bookshelf_db` e importa lo schema:
```sql
-- Esegui il contenuto di backend/config/schema.sql
```

### 3. Configurazione (variabili d'ambiente)
Copia `backend/.env.example` in `backend/.env` e compila i valori:
```bash
DB_HOST=localhost
DB_NAME=bookshelf_db
DB_USER=root
DB_PASS=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

CORS_ALLOWED_ORIGINS=https://sageshelf.great-site.net

MAIL_FROM=onboarding@resend.dev
MAIL_FROM_NAME=SageShelf
MAIL_API_KEY=
```
`backend/.env`

> In fase di sviluppo si può usare il dominio di test `onboarding@resend.dev` come `MAIL_FROM`, che funziona subito ma invia solo all'email con cui ti sei registrato su Resend. Per un uso reale con più utenti serve verificare un dominio proprio su Resend.

### 4. Deploy locale (XAMPP)
Copia l'intera cartella `bookshelf/` in `htdocs/`:
```
C:\xampp\htdocs\bookshelf\
```
Il sito sarà raggiungibile a `http://localhost/bookshelf/frontend/`

> Nota: in locale su `http://` (senza HTTPS), il cookie di sessione impostato con `'secure' => true` in `bootstrap.php` non viene inviato dal browser. Per testare in locale senza HTTPS, imposta temporaneamente `'secure' => false` in `backend/config/bootstrap.php`; ricordati di rimetterlo a `true` prima del deploy in produzione.

### 5. HTTPS (produzione)
Assicurati che `backend/config/bootstrap.php` abbia:
```php
'secure' => true,
```

---

## Autenticazione

SageShelf usa un login **passwordless**: nessuna password da ricordare o da violare.

1. L'utente inserisce la propria email (login) o email + username (registrazione)
2. Il backend genera un codice a 6 cifre, lo salva hashato in `login_codes` con scadenza a 10 minuti, e lo invia via email tramite Resend
3. L'utente inserisce il codice ricevuto
4. Se corretto e non scaduto, viene creata la sessione (e, se è la prima volta, l'utente viene registrato)

Limiti applicati lato server (in `LoginCodeModel`):
- un nuovo codice non può essere richiesto più di una volta ogni 60 secondi per la stessa email
- un codice scade dopo 10 minuti
- dopo 5 tentativi falliti di verifica, il codice viene invalidato e va richiesto uno nuovo

La sessione, una volta autenticato, dura 30 giorni e si rinnova automaticamente ad ogni richiesta autenticata (vedi `SESSION_LIFETIME` in `bootstrap.php`).

---

## Funzionalità

| Feature                      | Dettaglio                                                                  |
|------------------------------|----------------------------------------------------------------------------|
| **Autenticazione**           | Login/registrazione passwordless con codice OTP inviato via email          |
| **Profilo utente**           | Modifica username, email, avatar; eliminazione account                     |
| **Libreria**                 | Visualizza tutti i libri con stato di lettura                              |
| **Lista desideri**           | Sezione separata per i libri con `is_wishlist = true`                      |
| **Scaffali dinamici**        | Creati dall'utente, navigabili con frecce laterali sticky                  |
| **Scanner barcode**          | Tesseract.js OCR via webcam, fallback ISBN manuale                         |
| **Lookup ISBN**              | Google Books → Open Library (cascata automatica con cover fallback)        |
| **Inserimento manuale**      | Form con titolo, autore, editore, anno, ISBN                               |
| **Stato di lettura**         | Da leggere / In lettura / Letto (solo in libreria)                         |
| **Progress bar**             | Avanzamento lettura con pagine correnti/totali                             |
| **Date lettura**             | Inizio/fine con calcolo durata automatico (max oggi)                       |
| **Recensioni markdown**      | Rating 1–5 stelle + testo con rendering markdown live                      |
| **Note personali**           | Testo libero con markdown, solo per l'utente                               |
| **Dettagli edizione**        | Editore, anno, lingua, pagine, formato, ISBN, autofill da ISBN             |
| **Serie**                    | Nome serie e numero volume                                                 |
| **Acquisizione**             | Acquistato / Regalo / Altro con nota (solo in libreria)                    |
| **Copertine custom**         | Upload immagine dalla galleria, rimozione con pulizia file                 |
| **Ricerca globale**          | Filtro live su titolo, autore e ISBN su tutta la collezione                |
| **Statistiche**              | Counter per stato in libreria; solo totale in lista desideri               |
| **Sposta libri**             | Da libreria a lista desideri e viceversa dal popup dettaglio               |
| **Duplicate check**          | Errore se si tenta di aggiungere un libro già presente                     |

---

## Architettura MVP con ereditarietà

### Backend PHP
```
Request HTTP → views/api.php (View: routing thin)
                     ↓
              Presenter (logica business, validazione)
                     ↓
              Model (query PDO, nessuna logica)
                     ↓
              JSON response
```

### Frontend JavaScript — gerarchia delle classi

```
BaseModel
└── ApiModel                  (tutti gli endpoint REST)

BasePresenter
├── AuthPresenter             (login, registrazione, logout, profilo)
├── BookPresenter             (collezione, ISBN, recensioni)
├── BookDetailPresenter       (dettagli personali libro)
└── ShelfPresenter            (CRUD scaffali)

BaseView  (_esc, _formatLabel, _durationText, toast, modal)
├── AppView                   (rendering DOM, binding eventi, modal dettaglio)
├── BookDetailView            (pagina standalone book-detail.html)
└── ProfileView               (pagina profilo utente)
```

### Ordine di caricamento in index.html
```html
<script src="js/models/BaseModel.js"></script>
<script src="js/models/ApiModel.js"></script>
<script src="js/presenters/BasePresenter.js"></script>
<script src="js/presenters/AuthPresenter.js"></script>
<script src="js/presenters/BookPresenter.js"></script>
<script src="js/presenters/ShelfPresenter.js"></script>
<script src="js/presenters/BookDetailPresenter.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>
<script src="js/utils/MarkdownParser.js"></script>
<script src="js/utils/MarkdownEditor.js"></script>
<script src="js/views/BaseView.js"></script>
<script src="js/views/AppView.js"></script>
```

---

## Database

### Schema principale (`schema.sql`)
| Tabella        | Descrizione                                                                   |
|----------------|-------------------------------------------------------------------------------|
| `users`        | Utenti registrati (username, email, avatar_url — nessuna password)             |
| `login_codes`  | Codici OTP per il login: hash del codice, scadenza, tentativi, stato d'uso     |
| `shelves`      | Scaffali dinamici per utente (con posizione)                                  |
| `books`        | Catalogo globale dei libri (deduplicato per ISBN)                             |
| `user_books`   | Collezione personale — collega utente, libro, scaffale, stato e `is_wishlist` |
| `reviews`      | Recensioni con rating 1–5 e testo libero                                      |
| `book_details` | Dettagli personali: progress, date, serie, acquisizione, edizione, note       |

### Campo `is_wishlist`
La distinzione tra Libreria e Lista desideri avviene tramite il campo booleano `is_wishlist` su `user_books`:
- `is_wishlist = 0` → il libro è in **Libreria** (può avere qualsiasi stato)
- `is_wishlist = 1` → il libro è in **Lista desideri**

### Migrazioni
Se hai un database esistente da versioni precedenti:
```sql
-- Aggiunge note personali (v4 → v5)
ALTER TABLE book_details ADD COLUMN personal_notes TEXT DEFAULT NULL;

-- Aggiunge avatar utente
ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) NULL;

-- Passaggio a login passwordless (v5 → v6): rimuove password/security_answer,
-- aggiunge la tabella login_codes per i codici OTP
ALTER TABLE users DROP COLUMN password;
ALTER TABLE users DROP COLUMN security_answer;
-- Esegui poi la CREATE TABLE login_codes presente in schema.sql
```

---

## API Endpoints

### Auth
| Metodo | Path                 | Descrizione                                    |
|--------|----------------------|-------------------------------------------------|
| POST   | /auth/register/code  | Richiede il codice OTP per una nuova registrazione (email + username) |
| POST   | /auth/login/code     | Richiede il codice OTP per il login (email)     |
| POST   | /auth/verify         | Verifica il codice OTP e crea la sessione (registra l'utente se non esiste ancora) |
| POST   | /auth/logout         | Logout                                          |
| GET    | /auth/me             | Utente corrente                                 |
| PUT    | /auth/username       | Aggiorna username                               |
| PUT    | /auth/email          | Aggiorna email                                  |
| POST   | /auth/avatar         | Carica immagine profilo                         |
| DELETE | /auth/avatar         | Rimuovi immagine profilo                        |
| POST   | /auth/account/delete | Elimina account                                 |

### Libri
| Metodo | Path                    | Descrizione                           |
|--------|-------------------------|---------------------------------------|
| GET    | /books                  | Lista (libreria o wishlist)           |
| GET    | /books?shelf_id=X       | Filtro per scaffale                   |
| GET    | /books?wishlist=1       | Solo lista desideri                   |
| GET    | /books/lookup?isbn=X    | Lookup ISBN (Google Books + OL)       |
| GET    | /books/search?q=X       | Ricerca per titolo/autore             |
| GET    | /books/search?q=X&all=1 | Ricerca globale (libreria + wishlist)  |
| POST   | /books                  | Aggiungi libro                        |
| PUT    | /books/{id}             | Aggiorna stato/scaffale/wishlist      |
| DELETE | /books/{id}             | Rimuovi dalla collezione              |
| GET    | /books/{id}/show        | Dettaglio singolo user_book           |
| GET    | /books/{id}/details     | Dettagli personali libro              |
| PUT    | /books/{id}/details     | Salva dettagli personali              |
| POST   | /books/{id}/review      | Salva recensione                      |
| DELETE | /books/{id}/review      | Elimina recensione                    |
| POST   | /books/{id}/cover       | Carica copertina custom               |

### Scaffali
| Metodo | Path           | Descrizione       |
|--------|----------------|-------------------|
| GET    | /shelves       | Lista scaffali    |
| POST   | /shelves       | Crea scaffale     |
| PUT    | /shelves/{id}  | Modifica scaffale |
| DELETE | /shelves/{id}  | Elimina scaffale  |