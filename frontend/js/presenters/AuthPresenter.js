// frontend/js/presenters/AuthPresenter.js
// Estende BasePresenter con la logica di autenticazione (passwordless via OTP)

class AuthPresenter extends BasePresenter {
  constructor(view) {
    super(view);
  }

  async init() {
    await this._run(async () => {
      const { user } = await api.me();
      this.view.onLoggedIn(user);
    });
    if (!this.view._currentUser) this.view.onLoggedOut();
  }

  /**
   * Step 1 del login: invia il codice OTP all'email indicata.
   * Non crea la sessione — serve poi verifyCode().
   */
  async requestLoginCode(email) {
    await this._runWithLoading(async () => {
      await api.requestLoginCode({ email });
      this.view.onCodeRequested(email);
    });
  }

  /**
   * Step 1 della registrazione: invia il codice OTP, l'utente non viene
   * ancora creato (avviene solo alla verifica riuscita del codice).
   */
  async requestRegistrationCode(username, email) {
    await this._runWithLoading(async () => {
      await api.requestRegistrationCode({ username, email });
      this.view.onCodeRequested(email, username);
    });
  }

  /**
   * Step 2, comune a login e registrazione: verifica il codice ricevuto.
   * username è opzionale — serve solo se l'utente non esiste ancora
   * (prima verifica in assoluto per quella email).
   */
  async verifyCode(email, code, username = null) {
    await this._runWithLoading(async () => {
      const { user } = await api.verifyCode({ email, code, username });
      this.view.onLoggedIn(user);
    });
  }

  async logout() {
    await this._run(async () => {
      await api.logout();
      this.view.onLoggedOut();
    });
  }
}

window.AuthPresenter = AuthPresenter;