// GeoMiner AI — Prediction REST Integration v2.0

// ══════════════════════════════════════════
// Mineral color / icon lookup tables
// ══════════════════════════════════════════
const MINERAL_COLORS = {
    'Iron':       '#ef4444',
    'Copper':     '#f97316',
    'Zinc':       '#eab308',
    'Gold':       '#fbbf24',
    'Manganese':  '#8b5cf6',
    'Nickel':     '#06b6d4',
    'Lead':       '#64748b',
    'Chromium':   '#10b981',
    'Vanadium':   '#0ea5e9',
    'Cobalt':     '#6366f1',
    'Titanium':   '#a78bfa',
    'Molybdenum': '#f43f5e',
    'Tin':        '#84cc16',
    'Tungsten':   '#475569',
    'Silver':     '#cbd5e1',
    'Arsenic':    '#fb923c',
    'Bismuth':    '#e879f9',
    'Antimony':   '#facc15',
    'Barite':     '#4ade80',
    'Uranium':    '#22d3ee',
    'Thorium':    '#f87171',
    'Niobium':    '#c084fc',
    'Zirconium':  '#38bdf8',
    'Diamond':    '#e0f2fe',
    'Quartzite':  '#94a3b8',
    'Clay':       '#78716c',
    'default':    '#38bdf8'
};
const MINERAL_ICONS = {
    'Iron':       'fa-solid fa-cube',
    'Copper':     'fa-solid fa-circle',
    'Zinc':       'fa-solid fa-atom',
    'Gold':       'fa-solid fa-star',
    'Manganese':  'fa-solid fa-flask',
    'Nickel':     'fa-solid fa-gem',
    'Lead':       'fa-solid fa-weight-hanging',
    'Chromium':   'fa-solid fa-layer-group',
    'Vanadium':   'fa-solid fa-droplet',
    'Cobalt':     'fa-solid fa-magnet',
    'Titanium':   'fa-solid fa-shield-halved',
    'Molybdenum': 'fa-solid fa-bolt',
    'Tin':        'fa-solid fa-box',
    'Tungsten':   'fa-solid fa-hammer',
    'Silver':     'fa-solid fa-coins',
    'Arsenic':    'fa-solid fa-skull-crossbones',
    'Bismuth':    'fa-solid fa-snowflake',
    'Antimony':   'fa-solid fa-fire-flame-simple',
    'Barite':     'fa-solid fa-bars',
    'Uranium':    'fa-solid fa-radiation',
    'Thorium':    'fa-solid fa-sun',
    'Niobium':    'fa-solid fa-microchip',
    'Zirconium':  'fa-solid fa-circle-nodes',
    'Diamond':    'fa-solid fa-diamond',
    'Quartzite':  'fa-solid fa-mountain',
    'Clay':       'fa-solid fa-earth-americas',
    'default':    'fa-solid fa-certificate'
};

// ══════════════════════════════════════════
// DOMContentLoaded bootstrap
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // 1. Prediction form on predict.html
    const form = document.getElementById('prediction-form');
    if (form) form.addEventListener('submit', handlePredictionSubmit);

    // 2. Results page on results.html
    if (document.getElementById('res-score')) {
        loadPredictionResults();
    }

    // 3. Search input — submit on Enter
    const searchInput = document.getElementById('loc-search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleGeocodeSearch(); }
        });
    }
});

// ══════════════════════════════════════════
// PREDICTION SUBMIT (predict.html)
// ══════════════════════════════════════════
async function handlePredictionSubmit(e) {
    e.preventDefault();

    const latEl      = document.getElementById('inp-lat');
    const lonEl      = document.getElementById('inp-lon');
    const altEl      = document.getElementById('inp-alt');
    const feEl       = document.getElementById('inp-fe');
    const cuEl       = document.getElementById('inp-cu');
    const znEl       = document.getElementById('inp-zn');
    const rockEl     = document.getElementById('sel-rock-type');

    const lat      = parseFloat(latEl?.value);
    const lon      = parseFloat(lonEl?.value);
    const alt      = parseFloat(altEl?.value  || 450);
    const fe       = parseFloat(feEl?.value   || 5.0);
    const cu       = parseFloat(cuEl?.value   || 30.0);
    const zn       = parseFloat(znEl?.value   || 60.0);
    const rock_type = rockEl?.value || 'Granite';

    // Validate
    if (isNaN(lat) || isNaN(lon)) {
        Toast.warning('Please click the map to select a location, or enter valid coordinates.');
        return;
    }
    if (lat < 11 || lat > 19 || lon < 72 || lon > 84) {
        Toast.warning('Location appears outside coverage area (Karnataka & Andhra Pradesh, India). Results may be less accurate.');
    }

    // Show loader
    Loader.show('Running AI prediction engine…');

    const payload = { latitude: lat, longitude: lon, altitude: alt, fe, cu, zn, rock_type };

    try {
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server error ${response.status}`);
        }

        const data = await response.json();

        // Cache for results.html
        sessionStorage.setItem('latest_prediction', JSON.stringify(data));
        sessionStorage.setItem('input_fe', fe);
        sessionStorage.setItem('input_cu', cu);
        sessionStorage.setItem('input_zn', zn);

        Toast.success('Prediction complete! Redirecting to results…');
        setTimeout(() => { window.location.href = 'results.html'; }, 800);

    } catch (err) {
        Loader.hide();
        Toast.error(`Prediction failed: ${err.message}`);
        console.error('[GeoMiner] predict error:', err);
    }
}

// ══════════════════════════════════════════
// GEOCODE SEARCH
// ══════════════════════════════════════════
async function handleGeocodeSearch() {
    const searchEl = document.getElementById('loc-search-input');
    const query    = searchEl?.value?.trim();
    if (!query) { Toast.info('Enter a location name to search.'); return; }

    const savedKey = localStorage.getItem('google_maps_key') || '';
    try {
        const res = await fetch(`${API_BASE_URL}/geocode?q=${encodeURIComponent(query)}&key=${encodeURIComponent(savedKey)}`);
        if (!res.ok) throw new Error('Geocoding request failed.');
        const data = await res.json();
        if (data.success) {
            document.getElementById('inp-lat').value = data.latitude.toFixed(5);
            document.getElementById('inp-lon').value = data.longitude.toFixed(5);
            if (typeof recenterMap === 'function') recenterMap(data.latitude, data.longitude);
            Toast.success(`Found: ${query}`);
        } else {
            Toast.warning(`Location not found: "${query}". Try adding a state/country.`);
        }
    } catch (err) {
        Toast.error(`Geocoding error: ${err.message}`);
    }
}

// ══════════════════════════════════════════
// LOAD & RENDER RESULTS (results.html)
// ══════════════════════════════════════════
function loadPredictionResults() {
    const rawData = sessionStorage.getItem('latest_prediction');
    if (!rawData) {
        Toast.warning('No prediction data found. Redirecting…');
        setTimeout(() => { window.location.href = 'predict.html'; }, 1500);
        return;
    }

    const data = JSON.parse(rawData);

    // ── 1. Score ring ──
    const scoreVal = data.mineral_probability || 0;
    const scoreEl  = document.getElementById('res-score');
    if (scoreEl) scoreEl.textContent = `${scoreVal}%`;

    const circle = document.getElementById('score-circle');
    if (circle) {
        const circ   = 2 * Math.PI * 42;
        const offset = circ * (1 - scoreVal / 100);
        setTimeout(() => {
            circle.style.transition    = 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)';
            circle.style.strokeDashoffset = offset;
        }, 200);
    }

    // ── 2. Confidence badge ──
    const badge = document.getElementById('res-confidence-badge');
    if (badge) {
        badge.textContent = data.confidence || 'N/A';
        badge.className   = `badge ${getConfidenceBadgeClass(data.confidence)}`;
    }

    // ── 3. Location data ──
    setTextSafe('res-lat',       (data.latitude  || 0).toFixed(5));
    setTextSafe('res-lon',       (data.longitude || 0).toFixed(5));
    setTextSafe('res-alt',       data.altitude ? `${parseFloat(data.altitude).toFixed(1)} m` : '450.0 m');
    setTextSafe('res-formation', data.geological_zone || 'Unknown Formation');
    setTextSafe('res-rock-type', data.rock_type       || 'Unknown');

    // ── 4. AI Explanation ──
    const explanationEl = document.getElementById('res-explanation');
    if (explanationEl) {
        explanationEl.textContent = data.explanation || 'No known mineral occurrence or geological indicators found at the selected location.';
    }

    // ── 5. PDF download link ──
    const predId  = data._id ? (data._id.$oid || data._id.toString() || data._id) : null;
    const pdfBtn  = document.getElementById('btn-pdf-download');
    if (pdfBtn) {
        if (predId) {
            pdfBtn.href = `${API_BASE_URL}/predictions/${predId}/pdf`;
            pdfBtn.style.display = '';
        } else {
            pdfBtn.style.display = 'none';
        }
    }

    // ── 6. Mineral bars + donut ──
    renderMineralInventory(data.predicted_minerals || [], data.mineral_percentages || {});

    // ── 7. Results map ──
    if (typeof L !== 'undefined' && document.getElementById('results-explore-map')) {
        initResultsMap(data.latitude, data.longitude, data);
    }
}

// ── safe text setter ──
function setTextSafe(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ── confidence class ──
function getConfidenceBadgeClass(confidence) {
    switch ((confidence || '').toLowerCase()) {
        case 'high':   return 'badge-high';
        case 'medium': return 'badge-medium';
        case 'low':    return 'badge-low';
        default:       return 'badge-medium';
    }
}

// ── format percentage ──
function _fmtPct(pct) {
    if (pct === undefined || pct === null) return '1.50%';
    if (pct < 0.001)  return `${(pct * 100).toFixed(6)}%`;
    if (pct < 0.01)   return `${pct.toFixed(5)}%`;
    if (pct < 1.0)    return `${pct.toFixed(3)}%`;
    return `${pct.toFixed(2)}%`;
}

// ══════════════════════════════════════════
// MINERAL BARS + DONUT CHART
// ══════════════════════════════════════════
let donutChartInstance = null;

document.addEventListener('themechange', (e) => {
    const isLight = e.detail.theme === 'light';
    const textColor = isLight ? '#475569' : '#94a3b8';
    if (donutChartInstance) {
        donutChartInstance.options.plugins.legend.labels.color = textColor;
        donutChartInstance.update();
    }
});

function renderMineralInventory(minerals, percentages) {
    const container = document.getElementById('res-minerals-bars');
    if (!container) return;

    if (!minerals || minerals.length === 0) {
        container.innerHTML = '<p style="color:var(--text-3);font-size:0.85rem;font-style:italic;">No significant minerals identified at this location.</p>';
        return;
    }

    const values = minerals.map(m => Math.max(percentages[m] !== undefined ? percentages[m] : 1.5, 0.0001));
    const maxVal = Math.max(...values);

    container.innerHTML = '';

    minerals.forEach((mineral, i) => {
        const pct      = percentages[mineral] !== undefined ? percentages[mineral] : 1.5;
        const barWidth = maxVal > 0 ? Math.min(100, (Math.max(pct, 0.0001) / maxVal) * 100) : 20;
        const color    = MINERAL_COLORS[mineral] || MINERAL_COLORS['default'];
        const icon     = MINERAL_ICONS[mineral]  || MINERAL_ICONS['default'];

        const wrap = document.createElement('div');
        wrap.className = 'mineral-bar-wrap';
        wrap.innerHTML = `
            <div class="mineral-bar-header">
                <span class="mineral-bar-name">
                    <i class="${icon}" style="color:${color};width:14px;text-align:center;"></i>
                    ${mineral}
                </span>
                <span class="mineral-bar-pct">${_fmtPct(pct)}</span>
            </div>
            <div class="mineral-bar-bg">
                <div class="mineral-bar-fill" style="width:0%;background:${color};" data-target="${barWidth}"></div>
            </div>
        `;
        container.appendChild(wrap);

        setTimeout(() => {
            const fill = wrap.querySelector('.mineral-bar-fill');
            if (fill) fill.style.width = `${barWidth}%`;
        }, 150 + i * 80);
    });

    // Donut chart
    const canvas = document.getElementById('mineral-donut-chart');
    if (canvas && typeof Chart !== 'undefined') {
        if (donutChartInstance) {
            donutChartInstance.destroy();
            donutChartInstance = null;
        }

        if (!minerals || minerals.length === 0) {
            return;
        }

        const donutData   = minerals.map(m => Math.max(percentages[m] || 1.5, 0.0001));
        const donutColors = minerals.map(m => MINERAL_COLORS[m] || MINERAL_COLORS['default']);
        
        const isLight = document.documentElement.classList.contains('light-theme');
        const legendColor = isLight ? '#475569' : '#94a3b8';

        donutChartInstance = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: minerals,
                datasets: [{ data: donutData, backgroundColor: donutColors.map(c => c + 'cc'), borderColor: donutColors, borderWidth: 2, hoverOffset: 8 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11, family: "'Outfit', sans-serif" }, padding: 12, boxWidth: 12 } },
                    tooltip: { callbacks: { label: ctx => ` ${minerals[ctx.dataIndex]}: ${_fmtPct(percentages[minerals[ctx.dataIndex]] || 1.5)}` } }
                },
                cutout: '65%'
            }
        });
    }
}

// ══════════════════════════════════════════
// RESULTS MAP (results.html)
// ══════════════════════════════════════════
function initResultsMap(lat, lon, predData) {
    const mapEl = document.getElementById('results-explore-map');
    if (!mapEl) return;

    const map = L.map('results-explore-map', { preferCanvas: true }).setView([lat, lon], 11);

    const isLight = document.documentElement.classList.contains('light-theme');
    const tileUrl = isLight 
        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    const tileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 20
    }).addTo(map);

    // Listen for theme changes to dynamically update map tiles
    document.addEventListener('themechange', (e) => {
        const isL = e.detail.theme === 'light';
        const url = isL 
            ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        tileLayer.setUrl(url);
    });

    // Target marker
    const targetIcon = L.divIcon({
        html: `<div style="background:linear-gradient(135deg,#3B82F6,#a855f7);border:3px solid white;border-radius:50%;width:20px;height:20px;box-shadow:0 0 16px rgba(59,130,246,0.7);"></div>`,
        className: '', iconSize: [20, 20], iconAnchor: [10, 10]
    });
    
    L.marker([lat, lon], { icon: targetIcon }).addTo(map)
        .bindPopup(`
            <div style="font-family:sans-serif;min-width:180px;">
                <b style="color:#60a5fa;display:block;margin-bottom:6px;">🎯 Selected Target Coordinate</b>
                Latitude: <b>${lat.toFixed(5)}°N</b><br/>
                Longitude: <b>${lon.toFixed(5)}°E</b><br/>
                Altitude: <b>${(predData?.altitude || 450).toFixed(1)} m</b><br/>
                Formation: <b>${predData?.geological_zone || 'Unknown'}</b><br/>
                Rock Type: <b>${predData?.rock_type || 'Unknown'}</b><br/>
                Potential Score: <b style="color:#3B82F6;">${predData?.mineral_probability || 0}%</b>
            </div>
        `).openPopup();

    // Highlight geological zone centered around target point
    L.circle([lat, lon], {
        radius: 5000, color: '#38bdf8', fillColor: '#0284c7',
        fillOpacity: 0.1, weight: 2, dashArray: '6, 4'
    }).addTo(map);
}
