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
        // Mostra pulsante salva username quando modificato
        const usernameInput = document.getElementById('profile-username');
        const saveUsernameBtn = document.getElementById('profile-save-username');
        usernameInput.addEventListener('input', () => {
            saveUsernameBtn.classList.toggle('hidden', usernameInput.value.trim() === this._user.username);
        });

        // Salva username
        saveUsernameBtn.addEventListener('click', async () => {
            const username = usernameInput.value.trim();
            if (!username) { this.showError('Inserisci un username'); return; }
            try {
                await api.updateUsername({ username });
                this._user.username = username;
                document.getElementById('nav-username').title = username;
                saveUsernameBtn.classList.add('hidden');
                this.showSuccess('Username aggiornato!');
            } catch (e) { this.showError(e.message); }
        });

        // Nota: l'email non è più modificabile dal profilo — l'accesso
        // avviene via codice OTP inviato a quell'indirizzo, quindi cambiarla
        // senza riverificarne il possesso sarebbe un rischio di sicurezza.
        // Il campo #profile-email resta di sola visualizzazione (valorizzato
        // in init()); se l'HTML ha ancora pulsanti/campi per modificarla
        // (#profile-save-email, #profile-email-password-wrap,
        // #profile-email-password) andrebbero rimossi dalla pagina.

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