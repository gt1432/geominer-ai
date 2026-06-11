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

let selectedRockImageBase64 = '';
let selectedRockImageName = '';

function handleRockImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        Toast.warning('Image size must be less than 2MB.');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        selectedRockImageBase64 = e.target.result;
        selectedRockImageName = file.name;
        
        const preview = document.getElementById('rock-image-preview');
        const container = document.getElementById('rock-image-preview-container');
        const prompt = document.getElementById('rock-dropzone-prompt');
        
        if (preview) preview.src = selectedRockImageBase64;
        if (container) container.classList.remove('hidden');
        if (prompt) prompt.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}
window.handleRockImageSelect = handleRockImageSelect;

function clearRockImage(event) {
    if (event) event.stopPropagation();
    selectedRockImageBase64 = '';
    selectedRockImageName = '';
    
    const fileInput = document.getElementById('rock-image-input');
    if (fileInput) fileInput.value = '';
    
    const preview = document.getElementById('rock-image-preview');
    const container = document.getElementById('rock-image-preview-container');
    const prompt = document.getElementById('rock-dropzone-prompt');
    
    if (preview) preview.src = '';
    if (container) container.classList.add('hidden');
    if (prompt) prompt.classList.remove('hidden');
}
window.clearRockImage = clearRockImage;

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

    const lat      = parseFloat(latEl?.value);
    const lon      = parseFloat(lonEl?.value);
    const alt      = parseFloat(altEl?.value  || 450);
    const fe       = parseFloat(feEl?.value   || 5.0);
    const cu       = parseFloat(cuEl?.value   || 30.0);
    const zn       = parseFloat(znEl?.value   || 60.0);

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

    const payload = { latitude: lat, longitude: lon, altitude: alt, fe, cu, zn, image_path: selectedRockImageBase64 };

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
        if (selectedRockImageName) {
            sessionStorage.setItem('latest_prediction_image_name', selectedRockImageName);
        } else {
            sessionStorage.removeItem('latest_prediction_image_name');
        }

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

    // Check if query matches coordinates pattern: "lat, lon"
    const coordRegex = /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/;
    const match = query.match(coordRegex);
    if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[3]);
        if (!isNaN(lat) && !isNaN(lon)) {
            const latInput = document.getElementById('inp-lat');
            const lonInput = document.getElementById('inp-lon');
            if (latInput) latInput.value = lat.toFixed(5);
            if (lonInput) lonInput.value = lon.toFixed(5);
            if (typeof recenterMap === 'function') recenterMap(lat, lon);
            Toast.success(`Recentered map to: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
            return;
        }
    }

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

    // ── 1. Potential Score ring ──
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

    // ── 1b. Suitability Score ring ──
    const suitabilityVal = data.suitability_score || 0;
    const suitabilityEl  = document.getElementById('res-suitability-score');
    if (suitabilityEl) suitabilityEl.textContent = `${suitabilityVal}`;

    const suitabilityCircle = document.getElementById('suitability-circle');
    if (suitabilityCircle) {
        const circ   = 2 * Math.PI * 42;
        const offset = circ * (1 - suitabilityVal / 100);
        setTimeout(() => {
            suitabilityCircle.style.transition    = 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)';
            suitabilityCircle.style.strokeDashoffset = offset;
        }, 200);
    }

    const suitCategoryBadge = document.getElementById('res-suitability-category-badge');
    if (suitCategoryBadge) {
        suitCategoryBadge.textContent = data.suitability_category || 'Poor';
    }

    // ── 2. Confidence badge ──
    const badge = document.getElementById('res-confidence-badge');
    if (badge) {
        badge.textContent = data.confidence || 'N/A';
        badge.className   = `badge ${getConfidenceBadgeClass(data.confidence)}`;
    }

    // ── 3. Location data ──
    setTextSafe('res-lat',             (data.latitude  || 0).toFixed(5));
    setTextSafe('res-lon',             (data.longitude || 0).toFixed(5));
    setTextSafe('res-alt',             data.altitude ? `${parseFloat(data.altitude).toFixed(1)} m` : '450.0 m');
    setTextSafe('res-geological-unit', data.geological_unit || 'Unknown');
    setTextSafe('res-lithology',       data.lithology || 'Unknown');
    setTextSafe('res-formation',       data.formation || data.geological_zone || 'Unknown Formation');
    setTextSafe('res-rock-type',       data.rock_type || 'Unknown');
    setTextSafe('res-rock-description', data.rock_formation_description || data.formation || 'No formation description available.');

    // ── 3b. Rock Probabilities and classes ──
    const pIgn = data.rock_type_probabilities?.igneous !== undefined ? data.rock_type_probabilities.igneous : 0.0;
    const pSed = data.rock_type_probabilities?.sedimentary !== undefined ? data.rock_type_probabilities.sedimentary : 0.0;
    const pMet = data.rock_type_probabilities?.metamorphic !== undefined ? data.rock_type_probabilities.metamorphic : 0.0;

    setTextSafe('res-pct-igneous',     `${Math.round(pIgn * 100)}%`);
    setTextSafe('res-pct-sedimentary', `${Math.round(pSed * 100)}%`);
    setTextSafe('res-pct-metamorphic', `${Math.round(pMet * 100)}%`);

    const barIgn = document.getElementById('bar-igneous');
    if (barIgn) barIgn.style.width = `${Math.round(pIgn * 100)}%`;
    const barSed = document.getElementById('bar-sedimentary');
    if (barSed) barSed.style.width = `${Math.round(pSed * 100)}%`;
    const barMet = document.getElementById('bar-metamorphic');
    if (barMet) barMet.style.width = `${Math.round(pMet * 100)}%`;

    // ── 3c. Geological image preview ──
    const imgContainer = document.getElementById('res-rock-img-container');
    const imgPreview = document.getElementById('res-rock-img');
    const imgName = document.getElementById('res-rock-img-name');
    if (imgContainer && imgPreview && data.image_path) {
        imgPreview.src = data.image_path;
        if (imgName) {
            imgName.textContent = sessionStorage.getItem('latest_prediction_image_name') || 'uploaded_sample.png';
        }
        imgContainer.classList.remove('hidden');
    }

    // ── 4. AI Explanation & Insights ──
    const explanationEl = document.getElementById('res-explanation');
    if (explanationEl) {
        explanationEl.textContent = data.explanation || 'No known mineral occurrence or geological indicators found at the selected location.';
    }

    const insights = data.ai_insights || {};
    setTextSafe('res-insight-summary',   insights.geological_summary || data.explanation || 'No AI summary available.');
    setTextSafe('res-insight-zones',     insights.predicted_mineral_zones || 'No mineral zones identified.');
    setTextSafe('res-insight-potential', insights.exploration_potential || 'No potential analysis available.');
    setTextSafe('res-insight-risks',     insights.risk_factors || 'Low geological hazard.');

    // ── 4b. Documented Occurrences Banner ──
    const docMinerals = data.documented_minerals || [];
    const banner      = document.getElementById('documented-occ-banner');
    const docContainer= document.getElementById('res-documented-minerals');
    const beltBadge   = document.getElementById('res-belt-badge');

    if (banner && docContainer) {
        if (docMinerals.length > 0) {
            banner.classList.remove('hidden');
            docContainer.innerHTML = '';
            docMinerals.forEach(mineral => {
                const color = MINERAL_COLORS[mineral] || MINERAL_COLORS['default'];
                const icon  = MINERAL_ICONS[mineral]  || MINERAL_ICONS['default'];
                const chip  = document.createElement('span');
                chip.className = 'inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border';
                chip.style.cssText = `color:${color};border-color:${color}44;background:${color}18;`;
                chip.innerHTML = `<i class="${icon}" style="color:${color}"></i> ${mineral}`;
                docContainer.appendChild(chip);
            });
            if (beltBadge && data.belt_name) {
                beltBadge.textContent = `📍 ${data.belt_name}`;
                beltBadge.classList.remove('hidden');
            }
        } else {
            banner.classList.add('hidden');
        }
    }

    // ── 4c. Exploration Recommendations ──
    const priorityEl = document.getElementById('res-rec-priority');
    if (priorityEl) {
        priorityEl.textContent = `${(data.suitability_category || 'Poor').toUpperCase()} PRIORITY`;
    }
    setTextSafe('res-rec-surveys', insights.recommended_survey_type || 'Geological reconnaissance mapping & geophysical profiling.');
    setTextSafe('res-rec-data',    insights.additional_data_required || 'Core drilling profiles & high-resolution magnetic grids.');
    
    const nearbyEl = document.getElementById('res-rec-nearby');
    if (nearbyEl) {
        nearbyEl.innerHTML = `Nearest documented mineral occurrence: <b>${data.nearest_mineral || 'None'}</b> located <b>${(data.nearest_mineral_dist_km || 0).toFixed(1)} km</b> away.`;
    }

    // ── 4d. Mineral-Rock Correlation ──
    const correlation = data.correlation_details || {};
    const topMineral = data.predicted_minerals?.[0] || 'Unknown';
    setTextSafe('res-corr-mineral', topMineral);
    
    const assocRocks = Array.isArray(correlation.associated_rocks) ? correlation.associated_rocks.join(', ') : 'Unknown';
    setTextSafe('res-corr-rocks', assocRocks);
    setTextSafe('res-corr-env', correlation.geological_environment || 'Unknown');
    setTextSafe('res-corr-process', correlation.formation_process || 'Unknown');
    setTextSafe('res-corr-significance', correlation.exploration_significance || `Target anomalies matching ${topMineral} concentrations.`);

    // ── 5. Action and download links ──
    const predId  = data._id ? (data._id.$oid || data._id.toString() || data._id) : null;
    
    const csvBtn  = document.getElementById('btn-csv-download');
    if (csvBtn && predId) csvBtn.href = `${API_BASE_URL}/predictions/${predId}/csv`;
    
    const jsonBtn = document.getElementById('btn-json-download');
    if (jsonBtn && predId) jsonBtn.href = `${API_BASE_URL}/predictions/${predId}/json`;

    const pdfBtn  = document.getElementById('btn-pdf-download');
    if (pdfBtn && predId) pdfBtn.href = `${API_BASE_URL}/predictions/${predId}/pdf`;

    // Render Saved Toggle initial UI state
    renderSaveButton(data.saved_project);

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
        html: `<div style="background:linear-gradient(135deg,#D9A05B,#B8843E);border:3px solid white;border-radius:50%;width:20px;height:20px;box-shadow:0 0 16px rgba(217, 160, 91, 0.7);"></div>`,
        className: '', iconSize: [20, 20], iconAnchor: [10, 10]
    });
    
    L.marker([lat, lon], { icon: targetIcon }).addTo(map)
        .bindPopup(`
            <div style="font-family:sans-serif;min-width:180px;">
                <b style="color:#D9A05B;display:block;margin-bottom:6px;">🎯 Selected Target Coordinate</b>
                Latitude: <b>${lat.toFixed(5)}°N</b><br/>
                Longitude: <b>${lon.toFixed(5)}°E</b><br/>
                Altitude: <b>${(predData?.altitude || 450).toFixed(1)} m</b><br/>
                Formation: <b>${predData?.geological_zone || 'Unknown'}</b><br/>
                Rock Type: <b>${predData?.rock_type || 'Unknown'}</b><br/>
                Potential Score: <b style="color:#D9A05B;">${predData?.mineral_probability || 0}%</b>
            </div>
        `).openPopup();

    // Highlight geological zone centered around target point
    L.circle([lat, lon], {
        radius: 5000, color: '#D9A05B', fillColor: '#B8843E',
        fillOpacity: 0.1, weight: 2, dashArray: '6, 4'
    }).addTo(map);
}

// ══════════════════════════════════════════
// TOGGLE SAVE PROJECT STATE
// ══════════════════════════════════════════
async function toggleSaveProject() {
    const rawData = sessionStorage.getItem('latest_prediction');
    if (!rawData) return;
    const data = JSON.parse(rawData);
    const predId = data._id ? (data._id.$oid || data._id.toString() || data._id) : null;
    if (!predId) {
        Toast.warning('Cannot save this project: No database ID found.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/predictions/${predId}/save`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const result = await response.json();
        
        // Update cached session data
        data.saved_project = result.saved_project;
        sessionStorage.setItem('latest_prediction', JSON.stringify(data));
        
        // Update button UI
        renderSaveButton(result.saved_project);
        
        if (result.saved_project) {
            Toast.success('Project saved successfully!');
        } else {
            Toast.info('Project removed from saved list.');
        }
    } catch (err) {
        Toast.error(`Failed to save project: ${err.message}`);
    }
}
window.toggleSaveProject = toggleSaveProject;

function renderSaveButton(isSaved) {
    const starIcon = document.getElementById('btn-save-star');
    const textEl = document.getElementById('btn-save-text');
    const btn = document.getElementById('btn-save-project');
    
    if (!btn) return;
    
    if (isSaved) {
        if (starIcon) {
            starIcon.className = 'fa-solid fa-star';
        }
        if (textEl) {
            textEl.textContent = 'Project Saved';
        }
        btn.classList.add('bg-[#F59E0B]/20');
        btn.classList.remove('hover:bg-[#F59E0B]/10');
    } else {
        if (starIcon) {
            starIcon.className = 'fa-regular fa-star';
        }
        if (textEl) {
            textEl.textContent = 'Save Project';
        }
        btn.classList.remove('bg-[#F59E0B]/20');
        btn.classList.add('hover:bg-[#F59E0B]/10');
    }
}

