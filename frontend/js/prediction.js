// Prediction REST integrations for GeoMiner AI

document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Predict Form Handler
    const form = document.getElementById('prediction-form');
    if (form) {
        form.addEventListener('submit', handlePredictionSubmit);
    }
    
    // 2. Setup Geocoding Button Handler
    const geocodeBtn = document.getElementById('btn-geocode');
    if (geocodeBtn) {
        geocodeBtn.addEventListener('click', handleGeocodeSearch);
    }
});

// ─────────────────────────────────────────────
// Handle prediction submit (predict.html)
// ─────────────────────────────────────────────
async function handlePredictionSubmit(e) {
    e.preventDefault();
    
    const lat = parseFloat(document.getElementById('inp-lat').value);
    const lon = parseFloat(document.getElementById('inp-lon').value);
    const alt = parseFloat(document.getElementById('inp-alt').value || 450.0);
    const fe = parseFloat(document.getElementById('inp-fe').value || 5.0);
    const cu = parseFloat(document.getElementById('inp-cu').value || 30.0);
    const zn = parseFloat(document.getElementById('inp-zn').value || 60.0);
    const rock_type = document.getElementById('sel-rock-type').value;
    
    if (isNaN(lat) || isNaN(lon)) {
        alert('Please select a valid location on the map or enter valid coordinates.');
        return;
    }
    
    // Activate fullscreen loading spinner screen
    const loadingScreen = document.getElementById('pred-loading-screen');
    if (loadingScreen) loadingScreen.classList.add('active');
    
    const payload = { latitude: lat, longitude: lon, altitude: alt, fe, cu, zn, rock_type };
    
    try {
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Prediction failed.');
        }
        
        const data = await response.json();
        
        // Cache result in sessionStorage for results.html
        sessionStorage.setItem('latest_prediction', JSON.stringify(data));
        sessionStorage.setItem('input_fe', fe);
        sessionStorage.setItem('input_cu', cu);
        sessionStorage.setItem('input_zn', zn);
        
        // Redirect to results details page
        window.location.href = 'results.html';
        
    } catch (err) {
        alert(`Prediction Error: ${err.message}`);
        if (loadingScreen) loadingScreen.classList.remove('active');
    }
}

// ─────────────────────────────────────────────
// Handle location name geocoding search
// ─────────────────────────────────────────────
async function handleGeocodeSearch() {
    const query = document.getElementById('loc-search-input').value.trim();
    if (!query) {
        alert('Please enter a location name to search.');
        return;
    }
    
    const savedKey = localStorage.getItem('google_maps_key') || '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/geocode?q=${encodeURIComponent(query)}&key=${encodeURIComponent(savedKey)}`);
        if (!response.ok) throw new Error('Geocoding search failed.');
        
        const data = await response.json();
        if (data.success) {
            document.getElementById('inp-lat').value = data.latitude.toFixed(5);
            document.getElementById('inp-lon').value = data.longitude.toFixed(5);
            
            if (typeof recenterMap === 'function') {
                recenterMap(data.latitude, data.longitude);
            }
        } else {
            alert(`Location not found: "${query}"`);
        }
    } catch (err) {
        alert(`Geocoding failed: ${err.message}`);
    }
}

// ─────────────────────────────────────────────
// Load and populate results.html view
// ─────────────────────────────────────────────
function loadPredictionResults() {
    const rawData = sessionStorage.getItem('latest_prediction');
    if (!rawData) {
        window.location.href = 'predict.html';
        return;
    }
    
    const data = JSON.parse(rawData);
    
    // ── 1. Score Ring Animation ──
    const scoreVal = data.mineral_probability || 0;
    document.getElementById('res-score').textContent = `${scoreVal}%`;
    
    // Animate SVG circle stroke
    const circle = document.getElementById('score-circle');
    if (circle) {
        const circumference = 2 * Math.PI * 42; // r=42 => ~264
        const offset = circumference * (1 - scoreVal / 100);
        setTimeout(() => {
            circle.style.transition = 'stroke-dashoffset 1.2s ease';
            circle.style.strokeDashoffset = offset;
        }, 100);
    }
    
    // ── 2. Confidence Badge ──
    const badge = document.getElementById('res-confidence-badge');
    if (badge) {
        badge.textContent = data.confidence;
        badge.className = `badge ${getConfidenceBadgeClass(data.confidence)}`;
    }
    
    // ── 3. Location Data ──
    document.getElementById('res-lat').textContent = data.latitude.toFixed(5);
    document.getElementById('res-lon').textContent = data.longitude.toFixed(5);
    
    const altEl = document.getElementById('res-alt');
    if (altEl) altEl.textContent = data.altitude ? `${data.altitude.toFixed(1)} m` : '450.0 m';
    
    document.getElementById('res-formation').textContent = data.geological_zone || 'Unknown Formation';
    document.getElementById('res-rock-type').textContent = data.rock_type || 'Unknown';
    
    // ── 4. Nearest Target ──
    const nearestEl = document.getElementById('res-nearest-target');
    if (nearestEl && data.nearest_mineral) {
        nearestEl.textContent = `${data.nearest_mineral} (${(data.nearest_mineral_dist_km || 0).toFixed(2)} km away)`;
    }
    
    // ── 5. PDF Download Link (safe _id handling for both MongoDB ObjectId and JSON fallback string) ──
    const predId = data._id ? (data._id.$oid || data._id.toString() || data._id) : null;
    if (predId) {
        document.getElementById('btn-pdf-download').href = `${API_BASE_URL}/predictions/${predId}/pdf`;
    } else {
        // Hide PDF button if no ID available
        const pdfBtn = document.getElementById('btn-pdf-download');
        if (pdfBtn) { pdfBtn.style.display = 'none'; }
    }
    
    // ── 6. Mineral Inventory (Progress Bars + Donut Chart) ──
    renderMineralInventory(data.predicted_minerals || [], data.mineral_percentages || {});
    
    // ── 7. Results Map & Heatmap ──
    if (typeof L !== 'undefined' && document.getElementById('results-explore-map')) {
        fetch(`${API_BASE_URL}/occurrences`)
            .then(res => res.json())
            .then(occurrences => initResultsMap(data.latitude, data.longitude, occurrences, data))
            .catch(() => initResultsMap(data.latitude, data.longitude, [], data));
    }
}

// ─────────────────────────────────────────────
// Render mineral bars + donut chart
// ─────────────────────────────────────────────
const MINERAL_COLORS = {
    'Iron': '#ef4444',
    'Copper': '#f97316',
    'Zinc': '#eab308',
    'Gold': '#fbbf24',
    'Manganese': '#8b5cf6',
    'Nickel': '#06b6d4',
    'Lead': '#64748b',
    'Chromium': '#10b981',
    'Quartzite': '#94a3b8',
    'Clay': '#78716c',
    'default': '#38bdf8'
};

const MINERAL_ICONS = {
    'Iron': 'fa-solid fa-cube',
    'Copper': 'fa-solid fa-circle',
    'Zinc': 'fa-solid fa-atom',
    'Gold': 'fa-solid fa-star',
    'Manganese': 'fa-solid fa-flask',
    'Nickel': 'fa-solid fa-gem',
    'Lead': 'fa-solid fa-weight-hanging',
    'Chromium': 'fa-solid fa-layer-group',
    'Quartzite': 'fa-solid fa-mountain',
    'Clay': 'fa-solid fa-earth-americas',
    'default': 'fa-solid fa-certificate'
};

function formatPct(pct) {
    if (pct === undefined || pct === null) return '1.50%';
    if (pct < 0.001) return `${(pct * 100).toFixed(6)}%`;
    if (pct < 0.01) return `${pct.toFixed(5)}%`;
    if (pct < 1.0) return `${pct.toFixed(3)}%`;
    return `${pct.toFixed(2)}%`;
}

function renderMineralInventory(minerals, percentages) {
    const barsContainer = document.getElementById('res-minerals-bars');
    if (!barsContainer) return;
    
    if (!minerals || minerals.length === 0) {
        barsContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No significant minerals identified at this location.</p>';
        return;
    }
    
    // Normalize percentages to get relative bar widths
    const values = minerals.map(m => {
        const pct = percentages[m] !== undefined ? percentages[m] : 1.5;
        return Math.max(pct, 0.0001);
    });
    const maxVal = Math.max(...values);
    
    barsContainer.innerHTML = '';
    
    minerals.forEach((mineral, i) => {
        const pct = percentages[mineral] !== undefined ? percentages[mineral] : 1.5;
        const barWidth = maxVal > 0 ? Math.min(100, (Math.max(pct, 0.0001) / maxVal) * 100) : 20;
        const color = MINERAL_COLORS[mineral] || MINERAL_COLORS['default'];
        const icon = MINERAL_ICONS[mineral] || MINERAL_ICONS['default'];
        
        const wrap = document.createElement('div');
        wrap.className = 'mineral-bar-wrap';
        wrap.innerHTML = `
            <div class="mineral-bar-header">
                <span class="mineral-bar-name">
                    <i class="${icon}" style="color:${color};width:14px;text-align:center;"></i>
                    ${mineral}
                </span>
                <span class="mineral-bar-pct">${formatPct(pct)}</span>
            </div>
            <div class="mineral-bar-bg">
                <div class="mineral-bar-fill" style="width:0%;background:${color};" data-target="${barWidth}"></div>
            </div>
        `;
        barsContainer.appendChild(wrap);
        
        // Animate bar in
        setTimeout(() => {
            const fill = wrap.querySelector('.mineral-bar-fill');
            if (fill) fill.style.width = `${barWidth}%`;
        }, 150 + i * 80);
    });
    
    // ── Donut Chart ──
    const donutCanvas = document.getElementById('mineral-donut-chart');
    if (donutCanvas && typeof Chart !== 'undefined') {
        const donutData = minerals.map(m => Math.max(percentages[m] || 1.5, 0.0001));
        const donutColors = minerals.map(m => MINERAL_COLORS[m] || MINERAL_COLORS['default']);
        
        new Chart(donutCanvas, {
            type: 'doughnut',
            data: {
                labels: minerals,
                datasets: [{
                    data: donutData,
                    backgroundColor: donutColors.map(c => c + 'cc'),
                    borderColor: donutColors,
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            font: { size: 11, family: "'Outfit', sans-serif" },
                            padding: 12,
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const mineral = minerals[ctx.dataIndex];
                                const pct = percentages[mineral] || 1.5;
                                return ` ${mineral}: ${formatPct(pct)}`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }
}

// ─────────────────────────────────────────────
// Initialize Leaflet Map on Results Page
// ─────────────────────────────────────────────
function initResultsMap(lat, lon, occurrences, predData) {
    const map = L.map('results-explore-map').setView([lat, lon], 11);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
    
    // Custom icon for target
    const targetIcon = L.divIcon({
        html: `<div style="
            background: linear-gradient(135deg, #0284c7, #7c3aed);
            border: 3px solid white;
            border-radius: 50%;
            width: 20px; height: 20px;
            box-shadow: 0 0 16px rgba(56,189,248,0.7);
        "></div>`,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    
    // Place exploration target marker
    L.marker([lat, lon], { icon: targetIcon })
        .addTo(map)
        .bindPopup(`
            <div style="font-family:sans-serif; min-width:160px;">
                <b style="color:#38bdf8;">🎯 Prediction Target</b><br/>
                <span style="color:#94a3b8;">Lat:</span> <b>${lat.toFixed(5)}</b><br/>
                <span style="color:#94a3b8;">Lon:</span> <b>${lon.toFixed(5)}</b><br/>
                <span style="color:#94a3b8;">Alt:</span> <b>${(predData?.altitude || 450).toFixed(1)} m</b><br/>
                <span style="color:#94a3b8;">Score:</span> <b style="color:#38bdf8;">${predData?.mineral_probability || 0}%</b>
            </div>
        `).openPopup();
    
    // Draw 5km radius exploration circle
    L.circle([lat, lon], {
        radius: 5000,
        color: '#38bdf8',
        fillColor: '#0284c7',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '6, 4'
    }).addTo(map);
    
    // ── Heatmap ──
    if (occurrences && occurrences.length > 0) {
        const heatPoints = occurrences.map(occ => [occ.y, occ.x, 0.9]);
        heatPoints.push([lat, lon, 1.0]); // Target hotspot at max intensity
        
        // Background fill
        for (let i = 0; i < 40; i++) {
            const ref = occurrences[Math.floor(Math.random() * occurrences.length)];
            if (ref) {
                const dy = (Math.random() - 0.5) * 0.2;
                const dx = (Math.random() - 0.5) * 0.2;
                heatPoints.push([ref.y + dy, ref.x + dx, Math.random() * 0.5 + 0.25]);
            }
        }
        
        L.heatLayer(heatPoints, {
            radius: 28,
            blur: 22,
            maxZoom: 14,
            max: 1.0,
            gradient: {
                0.0: '#000033',
                0.3: '#0000ff',
                0.5: '#00ffff',
                0.65: '#00ff00',
                0.8: '#ffff00',
                0.9: '#ff8800',
                1.0: '#ff0000'
            }
        }).addTo(map);
        
        // ── Nearby occurrence markers ──
        const nearbyTargets = [];
        occurrences.forEach(occ => {
            const dist = Math.sqrt((occ.y - lat)**2 + (occ.x - lon)**2) * 111.0;
            if (dist <= 25.0) {
                const isMine = occ.type.toLowerCase().includes('quarry') || occ.type.toLowerCase().includes('mine');
                const color = isMine ? '#f59e0b' : '#ef4444';
                
                const circle = L.circleMarker([occ.y, occ.x], {
                    radius: 7,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 1.5,
                    opacity: 0.9,
                    fillOpacity: 0.85
                }).addTo(map);
                
                circle.bindPopup(`
                    <div style="font-family:sans-serif; min-width:150px;">
                        <b style="color:${color};">${isMine ? '⛏' : '💎'} ${occ.type}</b><br/>
                        <span style="color:#94a3b8;">Commodity:</span> <b>${occ.commodity}</b><br/>
                        <span style="color:#94a3b8;">Distance:</span> <b>${dist.toFixed(2)} km</b>
                    </div>
                `);
                
                nearbyTargets.push({ occ, dist, color });
            }
        });
        
        // ── Render nearby targets list ──
        const nearbyList = document.getElementById('nearby-targets-list');
        if (nearbyList) {
            if (nearbyTargets.length > 0) {
                nearbyTargets.sort((a, b) => a.dist - b.dist);
                nearbyList.innerHTML = '';
                nearbyTargets.slice(0, 6).forEach(({ occ, dist, color }) => {
                    const item = document.createElement('div');
                    item.className = 'exploration-target-card';
                    item.style.display = 'flex';
                    item.style.justifyContent = 'space-between';
                    item.style.alignItems = 'center';
                    item.style.padding = '12px 16px';
                    item.innerHTML = `
                        <div>
                            <div style="font-weight:600; color:var(--text-primary); font-size:0.9rem;">${occ.commodity}</div>
                            <div style="color:var(--text-muted); font-size:0.75rem; margin-top:3px;">${occ.type} &bull; ${occ.y.toFixed(4)}°N, ${occ.x.toFixed(4)}°E</div>
                        </div>
                        <div style="text-align:right; flex-shrink:0; margin-left:16px;">
                            <div style="font-size:0.95rem; font-weight:700; color:${color};">${dist.toFixed(2)} km</div>
                            <div style="font-size:0.7rem; color:var(--text-muted);">distance</div>
                        </div>
                    `;
                    nearbyList.appendChild(item);
                });
            } else {
                nearbyList.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No known mineral occurrences found within 25 km radius.</p>';
            }
        }
    }
}

// ─────────────────────────────────────────────
// Helper: Confidence badge class
// ─────────────────────────────────────────────
function getConfidenceBadgeClass(confidence) {
    switch ((confidence || '').toLowerCase()) {
        case 'high':   return 'badge-high';
        case 'medium': return 'badge-medium';
        case 'low':    return 'badge-low';
        default:       return 'badge-medium';
    }
}
