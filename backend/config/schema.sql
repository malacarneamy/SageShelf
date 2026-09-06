-- ============================================================
--  SageShelf — Database Schema (senza foreign key)
--  Compatibile con InfinityFree e hosting condivisi
--  Autenticazione: passwordless via codice email (OTP)
-- ============================================================

-- ── users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(150) NOT NULL UNIQUE,
    avatar_url      VARCHAR(500) NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── login_codes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_codes (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(150) NOT NULL,
    code_hash   VARCHAR(255) NOT NULL,
    expires_at  DATETIME     NOT NULL,
    used_at     DATETIME     NULL,
    attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── shelves ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shelves (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT          NOT NULL,
    name       VARCHAR(100) NOT NULL,
    position   INT          DEFAULT 0,
    sort_by    VARCHAR(20)  DEFAULT 'added_desc',
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_shelf (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── books ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    isbn           VARCHAR(20)  UNIQUE,
    title          VARCHAR(255) NOT NULL,
    author         VARCHAR(255),
    publisher      VARCHAR(255),
    published_year YEAR,
    cover_url      VARCHAR(512),
    description    TEXT,
    page_count     INT,
    language       VARCHAR(10),
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── user_books ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_books (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT        NOT NULL,
    book_id        INT        NOT NULL,
    shelf_id       INT        NULL,
    is_wishlist    TINYINT(1) NOT NULL DEFAULT 0,
    status         ENUM('want_to_read','reading','read') DEFAULT 'want_to_read',
    shelf_position INT        NOT NULL DEFAULT 0,
    added_at       DATETIME   DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_book (user_id, book_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── reviews ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT  NOT NULL,
    book_id     INT  NOT NULL,
    rating      TINYINT UNSIGNED,
    review_text TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_review (user_id, book_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── book_details ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_details (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    user_book_id      INT          NOT NULL,
    current_page      SMALLINT UNSIGNED DEFAULT 0,
    total_pages       SMALLINT UNSIGNED DEFAULT 0,
    started_at        DATE DEFAULT NULL,
    finished_at       DATE DEFAULT NULL,
    series_name       VARCHAR(255) DEFAULT NULL,
    series_volume     DECIMAL(5,1) DEFAULT NULL,
    acquisition       ENUM('purchased','gift','other') DEFAULT NULL,
    acquisition_note  VARCHAR(255) DEFAULT NULL,
    edition_publisher VARCHAR(255) DEFAULT NULL,
    edition_year      YEAR         DEFAULT NULL,
    edition_language  VARCHAR(64)  DEFAULT NULL,
    edition_label     VARCHAR(128) DEFAULT NULL,
    edition_format    ENUM('hardcover','paperback','ebook','audiobook','other') DEFAULT NULL,
    edition_isbn      VARCHAR(20)  DEFAULT NULL,
    personal_notes    TEXT         DEFAULT NULL,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_book_detail (user_book_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── user_preferences ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id     INT         NOT NULL PRIMARY KEY,
    all_sort_by VARCHAR(20) NOT NULL DEFAULT 'added_desc'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── indici ────────────────────────────────────────────────────
CREATE INDEX idx_user_books_user     ON user_books(user_id);
CREATE INDEX idx_user_books_status   ON user_books(status);
CREATE INDEX idx_user_books_shelf    ON user_books(shelf_id);
CREATE INDEX idx_user_books_wishlist ON user_books(is_wishlist);
CREATE INDEX idx_shelves_user        ON shelves(user_id);
CREATE INDEX idx_reviews_book        ON reviews(book_id);
CREATE INDEX idx_books_isbn          ON books(isbn);
CREATE INDEX idx_login_codes_email  ON login_codes(email);
CREATE INDEX idx_login_codes_expiry ON login_codes(expires_at);