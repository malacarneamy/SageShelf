// frontend/js/utils/PullToRefresh.js
// Gestisce il gesto "trascina verso il basso per aggiornare" su mobile,
// applicato a un contenitore scrollabile specifico.

class PullToRefresh {
    constructor({ container, indicator, onRefresh, threshold = 70 }) {
        this.container   = container;
        this.indicator   = indicator;
        this.onRefresh   = onRefresh;
        this.threshold   = threshold;
        this._startY     = 0;
        this._pulling    = false;
        this._refreshing = false;

        if (this.container && this.indicator) this._bind();
    }

    _bind() {
        this.container.addEventListener('touchstart', this._onStart.bind(this), { passive: true });
        this.container.addEventListener('touchmove',  this._onMove.bind(this),  { passive: true });
        this.container.addEventListener('touchend',   this._onEnd.bind(this));
    }

    _onStart(e) {
        if (this._refreshing || this.container.scrollTop > 0) return;
        this._startY  = e.touches[0].clientY;
        this._pulling = true;
    }

    _onMove(e) {
        if (!this._pulling || this._refreshing) return;
        const delta = e.touches[0].clientY - this._startY;

        if (delta <= 0 || this.container.scrollTop > 0) {
            this._reset();
            return;
        }

        const pull = Math.min(delta * 0.5, 90);
        this.indicator.style.transform = `translate(-50%, ${pull - 50}px)`;
        this.indicator.classList.toggle('visible', pull > 8);
        this.indicator.classList.toggle('ptr-ready', pull >= this.threshold);
    }

    async _onEnd() {
        if (!this._pulling || this._refreshing) { this._pulling = false; return; }

        const isReady = this.indicator.classList.contains('ptr-ready');
        this._pulling = false;
        this.indicator.style.transform = '';

        if (!isReady) { this._reset(); return; }

        this._refreshing = true;
        this.indicator.classList.add('visible', 'spinning');
        try {
            await this.onRefresh();
        } finally {
            setTimeout(() => {
                this._reset();
                this._refreshing = false;
            }, 350);
        }
    }

    _reset() {
        this.indicator.classList.remove('visible', 'spinning', 'ptr-ready');
        this.indicator.style.transform = '';
    }
}

window.PullToRefresh = PullToRefresh;