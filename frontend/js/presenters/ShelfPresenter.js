// frontend/js/presenters/ShelfPresenter.js

class ShelfPresenter extends BasePresenter {
  constructor(view) {
    super(view);
  }

  async load() {
    await this._run(async () => {
      const data = await api.getShelves();
      this.view.renderShelves(data.shelves);
    });
  }

  async create(name) {
    await this._run(async () => {
      await api.createShelf({ name });
      await this.load();
      this.view.onShelfSaved();
    });
  }

  async update(id, name) {
    await this._run(async () => {
      await api.updateShelf(id, { name });
      await this.load();
      this.view.onShelfSaved();
    });
  }

  async delete(id) {
    if (!confirm('Eliminare questo scaffale? I libri resteranno nella libreria senza scaffale.')) return;
    await this._run(async () => {
      await api.deleteShelf(id);
      await this.load();
    });
  }
}

window.ShelfPresenter = ShelfPresenter;