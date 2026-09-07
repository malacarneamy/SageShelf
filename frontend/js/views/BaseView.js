// frontend/js/views/BaseView.js
// Classe base per tutte le View — gestisce toast, loading e modal

class BaseView {

  // ── Toast ────────────────────────────────────────────────

  showError(msg) {
    this._toast(msg, 'toast--error', 3500);
  }

  showSuccess(msg) {
    this._toast(msg, 'toast--success', 2500);
  }

  _toast(msg, cls, duration) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = `toast ${cls}`;
      // Forza reflow prima di aggiungere 'show' per attivare la transizione CSS
      void el.offsetHeight;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), duration);
  }
  // ── Loading ──────────────────────────────────────────────

  setLoading(on) {
    const btn = document.getElementById('auth-btn');
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? 'Caricamento…' : (
      document.getElementById('auth-mode')?.dataset.mode === 'login'
        ? 'Accedi'
        : 'Registrati'
    );
  }

  // ── Modal helpers ────────────────────────────────────────

  _openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }

  _closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }
}

window.BaseView = BaseView;