// frontend/js/presenters/BasePresenter.js
// Classe base per tutti i Presenter

class BasePresenter {
  constructor(view) {
    this.view = view;
  }

  // Gestione errori centralizzata
  _handleError(e) {
      console.error('handleError:', e.message);
      this.view.showError(e.message || 'Errore sconosciuto');
  }

  // Esegue un'operazione asincrona con gestione errori automatica
  async _run(fn) {
    try {
      return await fn();
    } catch (e) {
      this._handleError(e);
    }
  }

  // Esegue un'operazione con stato di loading
  async _runWithLoading(fn) {
    this.view.setLoading(true);
    try {
      return await fn();
    } catch (e) {
      this._handleError(e);
    } finally {
      this.view.setLoading(false);
    }
  }
}

window.BasePresenter = BasePresenter;