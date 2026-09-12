// frontend/js/views/ProfileView.js

class ProfileView extends BaseView {

    constructor() {
        super();
        this._user = null;
    }

    async init() {
        // Verifica sessione
        this._loadTheme();
        try {
            const res  = await api.me();
            const user = res?.user ?? res;
            if (!user) return this._redirectLogin();
            this._user = user;
            document.getElementById('nav-username').title    = user.username || '👤';
            document.getElementById('profile-username').value = user.username || '';
            document.getElementById('profile-email').value = user.email || '';
            this._renderAvatar(user.avatar_url);
        } catch {
            return this._redirectLogin();
        }

        this._bindEvents();

        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            await api.logout();
            window.location.href = '/';
        });
    }

    _renderAvatar(url) {
        const img         = document.getElementById('profile-avatar-img');
        const placeholder = document.getElementById('profile-avatar-placeholder');
        const removeBtn   = document.getElementById('profile-remove-avatar');
        const nav         = document.getElementById('nav-username');
        if (url) {
            img.src = url;
            img.classList.remove('hidden');
            placeholder.classList.add('hidden');
            removeBtn.classList.remove('hidden');
            removeBtn.style.display = 'flex';
            nav.innerHTML = `<img src="${url}" class="nav-avatar-img" alt="avatar">`;
        } else {
            img.classList.add('hidden');
            placeholder.classList.remove('hidden');
            removeBtn.classList.add('hidden');
            removeBtn.style.display = '';
            nav.textContent = '👤';
        }
    }

    _applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme === 'night' ? 'night' : 'default');
        localStorage.setItem('sageshelf-theme', theme);
    }

    _loadTheme() {
        const saved = localStorage.getItem('sageshelf-theme');
        if (saved) this._applyTheme(saved);
        else this._applyTheme('default');
    }

    _bindEvents() {
        // Cambio username — stesso schema del cambio email (campo di sola
        // lettura + "Cambia" che apre una riga di modifica sotto), ma senza
        // verifica OTP: l'username non serve a identificare l'account via
        // login, quindi non c'è lo stesso rischio di sicurezza dell'email.
        const editUsernameBtn = document.getElementById('profile-edit-username-btn');
        const usernameNewWrap  = document.getElementById('profile-username-new-wrap');
        const usernameNewInput = document.getElementById('profile-username-new');
        const saveUsernameBtn  = document.getElementById('profile-save-username');

        const resetUsernameFlow = () => {
            usernameNewWrap.classList.add('hidden');
            usernameNewInput.value = '';
        };

        editUsernameBtn.addEventListener('click', () => {
            usernameNewInput.value = this._user.username || '';
            usernameNewWrap.classList.remove('hidden');
            usernameNewInput.focus();
            usernameNewInput.select();
        });

        document.getElementById('profile-username-cancel').addEventListener('click', resetUsernameFlow);

        saveUsernameBtn.addEventListener('click', async () => {
            const username = usernameNewInput.value.trim();
            if (!username) { this.showError('Inserisci un username'); return; }
            try {
                await api.updateUsername({ username });
                this._user.username = username;
                document.getElementById('profile-username').value = username;
                document.getElementById('nav-username').title = username;
                resetUsernameFlow();
                this.showSuccess('Username aggiornato!');
            } catch (e) { this.showError(e.message); }
        });

        // Cambio email — in due step, stesso principio dell'OTP di login:
        // il possesso della nuova email va riverificato, altrimenti chi ha
        // accesso alla sessione potrebbe dirottare l'account su un'email
        // che non controlla davvero.
        const editBtn      = document.getElementById('profile-edit-email-btn');
        const newWrap       = document.getElementById('profile-email-new-wrap');
        const newInput       = document.getElementById('profile-email-new');
        const codeWrap       = document.getElementById('profile-email-code-wrap');
        const codeInput      = document.getElementById('profile-email-code');
        const codeSentToEl   = document.getElementById('profile-email-code-sent-to');

        const resetEmailFlow = () => {
            newWrap.classList.add('hidden');
            codeWrap.classList.add('hidden');
            newInput.value  = '';
            codeInput.value = '';
        };

        editBtn.addEventListener('click', () => {
            resetEmailFlow();
            newWrap.classList.remove('hidden');
            newInput.focus();
        });

        document.getElementById('profile-email-cancel').addEventListener('click', resetEmailFlow);
        document.getElementById('profile-email-cancel-code').addEventListener('click', resetEmailFlow);

        document.getElementById('profile-email-send-code').addEventListener('click', async () => {
            const email = newInput.value.trim();
            if (!email) { this.showError('Inserisci la nuova email'); return; }
            try {
                await api.requestEmailChange(email);
                this._pendingNewEmail = email;
                codeSentToEl.textContent = email;
                newWrap.classList.add('hidden');
                codeWrap.classList.remove('hidden');
                codeInput.focus();
                this.showSuccess('Codice inviato! Controlla la nuova email.');
            } catch (e) { this.showError(e.message); }
        });

        document.getElementById('profile-email-confirm-code').addEventListener('click', async () => {
            const code = codeInput.value.trim();
            if (!code) { this.showError('Inserisci il codice ricevuto'); return; }
            try {
                await api.confirmEmailChange(this._pendingNewEmail, code);
                document.getElementById('profile-email').value = this._pendingNewEmail;
                this._user.email = this._pendingNewEmail;
                resetEmailFlow();
                this.showSuccess('Email aggiornata!');
            } catch (e) { this.showError(e.message); }
        });

        // Elimina account — non serve più conferma con password, la sessione
        // stessa è la prova di identità.
        document.getElementById('profile-delete-account-btn').addEventListener('click', () => {
            document.getElementById('profile-delete-panel').classList.remove('hidden');
        });
        document.getElementById('profile-cancel-delete').addEventListener('click', () => {
            document.getElementById('profile-delete-panel').classList.add('hidden');
        });
        document.getElementById('profile-delete-account').addEventListener('click', async () => {
            if (!confirm('Sei sicuro? Tutti i tuoi dati verranno eliminati definitivamente.')) return;
            try {
                await api.deleteAccount();
                this.showSuccess('Account eliminato');
                setTimeout(() => window.location.href = '/', 1200);
            } catch (e) { this.showError(e.message); }
        });

        // Avatar
        document.getElementById('profile-avatar-input').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('avatar', file);
            try {
                const res = await api.uploadAvatar(fd);
                if (res?.data?.avatar_url) {
                    this._renderAvatar(res.data.avatar_url);
                    this.showSuccess('Immagine aggiornata!');
                }
            } catch (e) { this.showError(e.message); }
        });
        document.getElementById('profile-remove-avatar')?.addEventListener('click', async () => {
            if (!confirm('Rimuovere l\'immagine profilo?')) return;
            try {
                await api.removeAvatar();
                this._renderAvatar(null);
                this.showSuccess('Immagine rimossa!');
            } catch (e) { this.showError(e.message); }
        });

        document.getElementById('btn-theme')?.addEventListener('click', () => {
            const current = localStorage.getItem('sageshelf-theme');
            this._applyTheme(current === 'night' ? 'default' : 'night');
        });
    }

    _redirectLogin() {
        window.location.href = '/';
    }
}

window.ProfileView = ProfileView;