// GeoMiner AI — Shared App Utilities v2.0
const API_BASE_URL = window.location.origin;

// ══════════════════════════════════════════
// TOAST NOTIFICATION SYSTEM
// ══════════════════════════════════════════
const Toast = {
    _container: null,
    _getContainer() {
        if (!this._container) {
            this._container = document.getElementById('toast-container');
            if (!this._container) {
                this._container = document.createElement('div');
                this._container.id = 'toast-container';
                document.body.appendChild(this._container);
            }
        }
        return this._container;
    },
    show(message, type = 'info', duration = 4000) {
        const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} toast-icon"></i><span>${message}</span>`;
        this._getContainer().appendChild(toast);
        requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, duration);
    },
    success(msg, dur) { this.show(msg, 'success', dur); },
    error(msg, dur)   { this.show(msg, 'error', dur); },
    warning(msg, dur) { this.show(msg, 'warning', dur); },
    info(msg, dur)    { this.show(msg, 'info', dur); }
};

// ══════════════════════════════════════════
// LOADING OVERLAY
// ══════════════════════════════════════════
const Loader = {
    _el: null,
    _getEl() {
        if (!this._el) {
            this._el = document.getElementById('pred-loading-screen');
            if (!this._el) {
                this._el = document.createElement('div');
                this._el.className = 'loading-overlay';
                this._el.innerHTML = `
                    <div class="spinner-ring"></div>
                    <div style="color:var(--text-3); font-size:0.9rem; font-weight:500;">
                        <span id="loader-msg">Running AI prediction...</span>
                    </div>
                    <div style="color:var(--text-4); font-size:0.78rem; margin-top:4px;">This may take 10–30 seconds</div>
                `;
                document.body.appendChild(this._el);
            }
        }
        return this._el;
    },
    show(msg = 'Running AI prediction...') {
        const el = this._getEl();
        const msgEl = el.querySelector('#loader-msg');
        if (msgEl) msgEl.textContent = msg;
        el.classList.add('active');
    },
    hide() { this._getEl().classList.remove('active'); }
};

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function formatLatLng(lat, lng) {
    return `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`;
}

function getConfidenceBadgeClass(confidence) {
    const c = (confidence || '').toLowerCase();
    if (c === 'high')   return 'badge-high';
    if (c === 'medium') return 'badge-medium';
    return 'badge-low';
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatPct(pct) {
    if (pct === undefined || pct === null) return '1.50%';
    if (pct < 0.001)  return `${(pct * 100).toFixed(6)}%`;
    if (pct < 0.01)   return `${pct.toFixed(5)}%`;
    if (pct < 1.0)    return `${pct.toFixed(3)}%`;
    return `${pct.toFixed(2)}%`;
}

function getScoreColor(score) {
    if (score >= 80) return 'var(--success)';
    if (score >= 50) return 'var(--warning)';
    return 'var(--danger)';
}

function getScoreLabel(score) {
    if (score >= 80) return 'HIGH';
    if (score >= 50) return 'MODERATE';
    return 'LOW';
}

// ══════════════════════════════════════════
// ANIMATED COUNTER
// ══════════════════════════════════════════
function animateValue(el, target, suffix = '', duration = 1500) {
    let start = null;
    function step(ts) {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const val = Math.round(eased * target);
        el.textContent = (target > 999 ? val.toLocaleString() : val) + suffix;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ══════════════════════════════════════════
// CIRCULAR GAUGE BUILDER
// ══════════════════════════════════════════
function buildGauge(containerId, score, label = '') {
    const el = document.getElementById(containerId);
    if (!el) return;
    const color = getScoreColor(score);
    const r = 54; const circ = 2 * Math.PI * r;
    const offset = circ * (1 - score / 100);
    el.innerHTML = `
        <svg width="130" height="130" viewBox="0 0 130 130" class="gauge-svg">
            <circle cx="65" cy="65" r="${r}" class="gauge-track" stroke-width="10"/>
            <circle cx="65" cy="65" r="${r}" class="gauge-fill"
                stroke="${color}" stroke-width="10"
                stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
                data-offset="${offset}" id="${containerId}-arc"
                stroke-linecap="round"/>
            <text x="65" y="60" class="gauge-label" fill="${color}" font-size="22" font-weight="800">${score}%</text>
            <text x="65" y="80" class="gauge-label" fill="var(--text-4)" font-size="10">${label || getScoreLabel(score)}</text>
        </svg>
    `;
    setTimeout(() => {
        const arc = document.getElementById(`${containerId}-arc`);
        if (arc) arc.style.strokeDashoffset = offset;
    }, 100);
}

// ══════════════════════════════════════════
// MINERAL DATABASE (for info cards)
// ══════════════════════════════════════════
const MINERAL_DB = {
    'Iron': {
        icon: '⚙️', color: '#EF4444',
        uses: ['Steel production', 'Construction', 'Vehicle manufacturing'],
        geo_env: 'Banded Iron Formation (BIF), magnetite-rich amphibolite',
        economic: 'High — USD 120/tonne. India is world\'s 4th largest producer.',
        demand: 'HIGH',
    },
    'Copper': {
        icon: '🔌', color: '#F97316',
        uses: ['Electrical wiring', 'Plumbing', 'Electronics'],
        geo_env: 'Volcanic-hosted massive sulphide (VMS), porphyry copper systems',
        economic: 'High — USD 8,000/tonne. Critical for EV transition.',
        demand: 'VERY HIGH',
    },
    'Zinc': {
        icon: '🛡️', color: '#EAB308',
        uses: ['Galvanization', 'Alloys', 'Batteries'],
        geo_env: 'Carbonate-hosted (Mississippi Valley type), skarn deposits',
        economic: 'Medium-High — USD 2,600/tonne.',
        demand: 'HIGH',
    },
    'Gold': {
        icon: '✨', color: '#F59E0B',
        uses: ['Jewellery', 'Electronics', 'Investment reserves'],
        geo_env: 'Orogenic lode gold, shear zones in Archaean greenstone belts',
        economic: 'Very High — USD 62,000/kg. Kolar Gold Fields historically significant.',
        demand: 'VERY HIGH',
    },
    'Manganese': {
        icon: '🔋', color: '#8B5CF6',
        uses: ['Steel alloying', 'Batteries', 'Fertilizers'],
        geo_env: 'Sedimentary manganese oxide, BIF-related manganiferous chert',
        economic: 'Medium — USD 2,000/tonne. India holds 4th largest reserves.',
        demand: 'HIGH',
    },
    'Nickel': {
        icon: '⚡', color: '#06B6D4',
        uses: ['Stainless steel', 'EV batteries', 'Catalysts'],
        geo_env: 'Komatiite-hosted, lateritic nickel from mafic/ultramafic rocks',
        economic: 'High — USD 14,000/tonne. Critical EV mineral.',
        demand: 'VERY HIGH',
    },
    'Chromium': {
        icon: '🔩', color: '#10B981',
        uses: ['Stainless steel', 'Chrome plating', 'Refractory materials'],
        geo_env: 'Stratiform chromitite in layered mafic-ultramafic intrusions',
        economic: 'Medium — USD 10,000/tonne chrome ore.',
        demand: 'HIGH',
    },
    'Lead': {
        icon: '🏗️', color: '#64748B',
        uses: ['Batteries', 'Radiation shielding', 'Soldering'],
        geo_env: 'Sediment-hosted (SEDEX), carbonate-hosted Pb-Zn',
        economic: 'Medium — USD 1,900/tonne.',
        demand: 'MODERATE',
    },
};

function getMineralInfo(name) {
    return MINERAL_DB[name] || {
        icon: '💎', color: 'var(--primary-light)',
        uses: ['Industrial minerals', 'Construction', 'Chemical industry'],
        geo_env: 'Various geological settings',
        economic: 'Varies by local market conditions.',
        demand: 'MODERATE'
    };
}
