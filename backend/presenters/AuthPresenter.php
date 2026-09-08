<?php
// backend/presenters/AuthPresenter.php

class AuthPresenter {
    private UserModel $model;
    private LoginCodeModel $codes;

    public function __construct() {
        $this->model = new UserModel();
        $this->codes = new LoginCodeModel();
    }

    /**
     * Step 1 della registrazione: valida email/username liberi, genera un
     * codice OTP e lo invia via email. Non crea ancora l'utente.
     */
    public function requestRegistrationCode(array $body): array {
        $username = trim($body['username'] ?? '');
        $email    = trim(strtolower($body['email'] ?? ''));

        if (!$username || !$email)
            respondError('Username ed email sono obbligatori');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL))
            respondError('Email non valida');

        if ($this->model->findByUsername($username))
            respondError('Username già in uso');

        if ($this->model->findByEmail($email))
            respondError('Email già registrata. Prova ad accedere.', 409);

        if ($this->codes->wasRequestedRecently($email))
            respondError('Codice già inviato di recente, attendi prima di richiederne un altro.', 429);

        $this->_generateAndSendCode($email);

        return ['email' => $email];
    }

    /**
     * Step 1 del login: l'utente deve già esistere. Genera e invia il codice.
     */
    public function requestLoginCode(array $body): array {
        $email = trim(strtolower($body['email'] ?? ''));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL))
            respondError('Email non valida');

        if (!$this->model->findByEmail($email)) {
            respondError('Nessun account trovato con questa email. Registrati per crearne uno.', 200);
        }

        if ($this->codes->wasRequestedRecently($email))
            respondError('Codice già inviato di recente, attendi prima di richiederne un altro.', 429);

        $this->_generateAndSendCode($email);

        return ['email' => $email];
    }

    /**
     * Step 2, comune a login e registrazione: verifica il codice.
     * Se l'utente non esiste ancora ed è passato uno username, lo crea.
     */
    public function verifyCode(array $body): array {
        $email    = trim(strtolower($body['email'] ?? ''));
        $code     = trim($body['code'] ?? '');
        $username = trim($body['username'] ?? '');

        if (!$email || !$code)
            respondError('Email e codice sono obbligatori');

        $row = $this->codes->findLatestValidByEmail($email);
        if (!$row)
            respondError('Codice scaduto o non trovato. Richiedine uno nuovo.', 401);

        if ((int)$row['attempts'] >= LoginCodeModel::MAX_ATTEMPTS)
            respondError('Troppi tentativi falliti. Richiedi un nuovo codice.', 429);

        if (!password_verify($code, $row['code_hash'])) {
            $this->codes->incrementAttempts((int)$row['id']);
            respondError('Codice non valido.', 401);
        }

        $this->codes->markUsed((int)$row['id']);

        $user = $this->model->findByEmail($email);
        if (!$user) {
            // Prima verifica in assoluto per questa email → registrazione.
            if (!$username)
                respondError('Username obbligatorio per completare la registrazione.');
            if ($this->model->findByUsername($username))
                respondError('Username già in uso');

            $id   = $this->model->create($username, $email);
            $user = $this->model->findById($id);
        }

        $_SESSION['user_id']  = $user['id'];
        $_SESSION['username'] = $user['username'];
        session_regenerate_id(true); // previene session fixation dopo il login

        return ['user' => $user];
    }

    public function logout(): array {
        session_destroy();
        return ['message' => 'Disconnesso'];
    }

    public function me(): array {
        $userId = requireAuth();
        $user   = $this->model->findById($userId);
        if (!$user) respondError('Utente non trovato', 404);
        return ['user' => $user];
    }

    public function updateUsername(int $userId, array $body): array {
        $username = trim($body['username'] ?? '');
        if (!$username) respondError('Username obbligatorio');

        $existing = $this->model->findByUsername($username);
        if ($existing && (int)$existing['id'] !== $userId)
            respondError('Username già in uso');

        $this->model->updateUsername($userId, $username);
        $_SESSION['username'] = $username;
        return ['updated' => true];
    }

    public function deleteAccount(int $userId): array {
        $this->model->delete($userId);
        session_destroy();
        return ['deleted' => true];
    }

    public function uploadAvatar(int $userId, array $files): array {
        if (empty($files['avatar']['tmp_name'])) respondError('Nessun file ricevuto');

        $file    = $files['avatar'];
        $allowed = ['image/jpeg', 'image/png', 'image/webp'];
        $mime    = mime_content_type($file['tmp_name']);
        if (!in_array($mime, $allowed)) respondError('Formato non supportato');
        if ($file['size'] > 2 * 1024 * 1024) respondError('File troppo grande (max 2MB)');

        // Elimina vecchio avatar da Cloudinary se esiste
        $user = $this->model->findById($userId);
        if (!empty($user['avatar_url']) && str_contains($user['avatar_url'], 'cloudinary.com')) {
            $publicId = pathinfo(parse_url($user['avatar_url'], PHP_URL_PATH), PATHINFO_FILENAME);
            $this->_cloudinaryDelete('sageshelf/avatars/' . $publicId);
        }

        $url = $this->_cloudinaryUpload($file['tmp_name'], 'sageshelf/avatars');
        if (!$url) respondError('Errore caricamento su Cloudinary');

        $this->model->updateAvatar($userId, $url);
        return ['avatar_url' => $url];
    }

    public function removeAvatar(int $userId): array {
        $user = $this->model->findById($userId);
        if (!empty($user['avatar_url']) && str_contains($user['avatar_url'], 'cloudinary.com')) {
            $publicId = pathinfo(parse_url($user['avatar_url'], PHP_URL_PATH), PATHINFO_FILENAME);
            $this->_cloudinaryDelete('sageshelf/avatars/' . $publicId);
        }
        $this->model->updateAvatar($userId, null);
        return ['removed' => true];
    }

    // ── Interni ────────────────────────────────────────────────

    private function _generateAndSendCode(string $email): void {
        $code     = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $codeHash = password_hash($code, PASSWORD_DEFAULT);

        $this->codes->create($email, $codeHash);

        $sent = sendEmail(
            $email,
            'Il tuo codice di accesso SageShelf',
            "Il tuo codice di accesso è: {$code}\n\nScade tra " . LoginCodeModel::EXPIRY_MINUTES . " minuti.\nSe non hai richiesto questo codice, ignora questa email."
        );

        if (!$sent) respondError('Impossibile inviare l\'email. Riprova più tardi.', 500);
    }

    private function _cloudinaryUpload(string $tmpPath, string $folder): ?string {
        if (CLOUDINARY_CLOUD_NAME === '' || CLOUDINARY_API_KEY === '' || CLOUDINARY_API_SECRET === '') {
            error_log('_cloudinaryUpload: credenziali Cloudinary non configurate in .env');
            return null;
        }

        $timestamp    = time();
        $paramsToSign = "folder={$folder}&timestamp={$timestamp}";
        $signature    = sha1($paramsToSign . CLOUDINARY_API_SECRET);

        $ch = curl_init('https://api.cloudinary.com/v1_1/' . CLOUDINARY_CLOUD_NAME . '/image/upload');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'file'      => new CURLFile($tmpPath),
            'api_key'   => CLOUDINARY_API_KEY,
            'timestamp' => $timestamp,
            'folder'    => $folder,
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

        $ch = curl_init('https://api.cloudinary.com/v1_1/' . CLOUDINARY_CLOUD_NAME . '/image/destroy');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'public_id' => $publicId,
            'api_key'   => CLOUDINARY_API_KEY,
            'timestamp' => $timestamp,
            'signature' => $signature,
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $httpCode >= 200 && $httpCode < 300;
    }
}