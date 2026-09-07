// frontend/js/models/BaseModel.js
// Classe base per tutti i Model — gestisce le chiamate HTTP

class BaseModel {
  #base;

  constructor(base) {
    this.#base = base;
  }

  async _request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (body) opts.body = JSON.stringify(body);

    const res  = await fetch(this.#base + path, opts);
    const data = await res.json();
    if (!data.success) throw new Error(data.error ?? data.message ?? 'Errore sconosciuto');
    return data.data;
  }

  _get  = (path)       => this._request('GET',    path);
  _post = (path, body) => this._request('POST',   path, body);
  _put  = (path, body) => this._request('PUT',    path, body);
  _del  = (path)       => this._request('DELETE', path);
}

window.BaseModel = BaseModel;