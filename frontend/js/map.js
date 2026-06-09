// GeoMiner AI — GIS Map Handler v2.0
// Supports: point/area selection, tile layer switching, heatmap toggle

let exploreMap      = null;
let activeMarker    = null;
let heatmapLayer    = null;
let heatmapVisible  = false;
let occurrencesLayer = null;
let explorationArea = null;
let selectionRect   = null;
let selectionMode   = 'point'; // 'point' | 'area'
let drawStart       = null;

// Tile layer references
let tileLayers = {};
let activeTile = 'osm';

const MAP_THEMES = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
};

const TILE_DEFS = {
    osm: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        options: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd', maxZoom: 20
        }
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye',
            maxZoom: 18
        }
    },
    geo: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        options: {
            attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
            maxZoom: 17
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const mapId = 'prediction-map';
    const mapContainer = document.getElementById(mapId);
    if (!mapContainer) return;

    // Default to Chitradurga, Karnataka
    const startLat = 14.2207;
    const startLon = 76.2385;

    // Detect theme
    const isLight = document.documentElement.classList.contains('light-theme');
    TILE_DEFS.osm.url = isLight ? MAP_THEMES.light : MAP_THEMES.dark;

    // Init map
    exploreMap = L.map(mapId, { zoomControl: true, preferCanvas: true }).setView([startLat, startLon], 10);

    // Build tile layers
    Object.entries(TILE_DEFS).forEach(([key, def]) => {
        tileLayers[key] = L.tileLayer(def.url, def.options);
    });
    tileLayers['osm'].addTo(exploreMap);

    // Listen for theme changes to dynamically update map tiles
    document.addEventListener('themechange', (e) => {
        const isL = e.detail.theme === 'light';
        if (tileLayers['osm']) {
            tileLayers['osm'].setUrl(isL ? MAP_THEMES.light : MAP_THEMES.dark);
        }
    });

    // Default draggable marker
    activeMarker = L.marker([startLat, startLon], { draggable: true }).addTo(exploreMap);
    activeMarker.bindPopup(makePopup(startLat, startLon)).openPopup();

    // Exploration radius circle
    explorationArea = L.circle([startLat, startLon], {
        radius: 5000,
        color: '#3B82F6',
        fillColor: '#1d4ed8',
        fillOpacity: 0.10,
        weight: 1.8,
        dashArray: '6, 4'
    }).addTo(exploreMap);

    // Update inputs on drag
    activeMarker.on('dragend', () => {
        const pos = activeMarker.getLatLng();
        updateCoords(pos.lat, pos.lng);
        if (explorationArea) explorationArea.setLatLng([pos.lat, pos.lng]);
        activeMarker.setPopupContent(makePopup(pos.lat, pos.lng));
    });

    // ── Point click ──
    exploreMap.on('click', (e) => {
        if (selectionMode !== 'point') return;
        const { lat, lng } = e.latlng;
        activeMarker.setLatLng([lat, lng]);
        activeMarker.setPopupContent(makePopup(lat, lng)).openPopup();
        if (explorationArea) explorationArea.setLatLng([lat, lng]);
        updateCoords(lat, lng);
    });

    // ── Area draw ──
    exploreMap.on('mousedown', (e) => {
        if (selectionMode !== 'area') return;
        exploreMap.dragging.disable();
        drawStart = e.latlng;
        if (selectionRect) { exploreMap.removeLayer(selectionRect); selectionRect = null; }
        selectionRect = L.rectangle([drawStart, drawStart], {
            color: '#a855f7', fillColor: '#7c3aed',
            fillOpacity: 0.15, weight: 2, dashArray: '4, 3'
        }).addTo(exploreMap);
    });

    exploreMap.on('mousemove', (e) => {
        if (selectionMode !== 'area' || !drawStart || !selectionRect) return;
        selectionRect.setBounds(L.latLngBounds(drawStart, e.latlng));
    });

    exploreMap.on('mouseup', (e) => {
        if (selectionMode !== 'area' || !drawStart) return;
        exploreMap.dragging.enable();
        const bounds  = L.latLngBounds(drawStart, e.latlng);
        const center  = bounds.getCenter();
        const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth()) * 111;
        const lonSpan = Math.abs(bounds.getEast()  - bounds.getWest())  * 111 * Math.cos(center.lat * Math.PI / 180);
        activeMarker.setLatLng(center);
        activeMarker.setPopupContent(`
            <div style="font-family:sans-serif;min-width:160px;">
                <b style="color:#a855f7;">🟪 Selected Area</b><br/>
                Center: ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}<br/>
                Area: ~${latSpan.toFixed(1)} × ${lonSpan.toFixed(1)} km
            </div>
        `).openPopup();
        if (explorationArea) explorationArea.setLatLng(center);
        updateCoords(center.lat, center.lng);
        drawStart = null;
    });

    // ── Occurrence layer ──
    occurrencesLayer = L.layerGroup().addTo(exploreMap);
    loadOccurrencesAndHeatmap();

    // Cursor
    exploreMap.getContainer().style.cursor = 'crosshair';
});

// ══════════════════════════════════
// PUBLIC: Switch tile layer
// ══════════════════════════════════
function switchTile(key) {
    if (!exploreMap || !tileLayers[key] || activeTile === key) return;
    exploreMap.removeLayer(tileLayers[activeTile]);
    tileLayers[key].addTo(exploreMap);
    activeTile = key;

    // Update button states
    document.querySelectorAll('.layer-btn[id^="layer-"]').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`layer-${key}`);
    if (btn) btn.classList.add('active');
}

// ══════════════════════════════════
// PUBLIC: Toggle heatmap
// ══════════════════════════════════
function toggleHeatmap() {
    if (!exploreMap || !heatmapLayer) return;
    const btn = document.getElementById('layer-heat');
    if (heatmapVisible) {
        exploreMap.removeLayer(heatmapLayer);
        heatmapVisible = false;
        if (btn) btn.classList.remove('active');
    } else {
        exploreMap.addLayer(heatmapLayer);
        heatmapVisible = true;
        if (btn) btn.classList.add('active');
    }
}

// ══════════════════════════════════
// PUBLIC: Set point / area mode
// ══════════════════════════════════
function setMode(mode) {
    selectionMode = mode;

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const modeBtn = document.getElementById(`mode-${mode}`);
    if (modeBtn) modeBtn.classList.add('active');

    const infoEl = document.getElementById('mode-info-text');
    if (infoEl) {
        infoEl.innerHTML = mode === 'area'
            ? '<b>Area mode:</b> Click and drag on the map to draw a selection rectangle. The center will be used as the prediction target.'
            : '<b>Point mode:</b> Click anywhere on the map to select a prediction target. Coordinates auto-fill in the form.';
    }

    if (mode === 'point' && selectionRect) {
        exploreMap.removeLayer(selectionRect);
        selectionRect = null;
    }
    if (exploreMap) exploreMap.getContainer().style.cursor = 'crosshair';
}

// ══════════════════════════════════
// Helper: build popup HTML
// ══════════════════════════════════
function makePopup(lat, lng) {
    return `
        <div style="font-family:sans-serif;min-width:150px;">
            <b style="color:#60a5fa;">📍 Exploration Target</b><br/>
            <span>Lat: ${parseFloat(lat).toFixed(5)}</span><br/>
            <span>Lon: ${parseFloat(lng).toFixed(5)}</span>
        </div>
    `;
}

// ══════════════════════════════════
// Helper: fill coordinate inputs + pill
// ══════════════════════════════════
function updateCoords(lat, lon) {
    const latInput = document.getElementById('inp-lat');
    const lonInput = document.getElementById('inp-lon');
    if (latInput) latInput.value = parseFloat(lat).toFixed(5);
    if (lonInput) lonInput.value = parseFloat(lon).toFixed(5);

    // Update coordinate pill
    const pill    = document.getElementById('coord-pill');
    const display = document.getElementById('coord-display');
    if (pill && display) {
        display.textContent = `${parseFloat(lat).toFixed(5)}, ${parseFloat(lon).toFixed(5)}`;
        pill.style.display = 'block';
    }
}

// ══════════════════════════════════
// Load occurrences + build heatmap
// ══════════════════════════════════
async function loadOccurrencesAndHeatmap() {
    try {
        const res = await fetch(`${window.API_BASE_URL || window.location.origin}/occurrences`);
        if (!res.ok) return;
        const occurrences = await res.json();

        occurrences.forEach(occ => {
            const isMine = occ.type.toLowerCase().includes('quarry') || occ.type.toLowerCase().includes('mine');
            const color  = isMine ? '#f59e0b' : '#ef4444';
            const circle = L.circleMarker([occ.y, occ.x], {
                radius: 7, fillColor: color, color: '#ffffff',
                weight: 1.2, opacity: 0.9, fillOpacity: 0.85
            });
            circle.bindPopup(`
                <div style="font-family:sans-serif;min-width:140px;">
                    <b style="color:${color};">${isMine ? '⛏' : '💎'} ${occ.type}</b><br/>
                    <span style="color:#94a3b8;">Commodity:</span> <b>${occ.commodity}</b><br/>
                    <span style="color:#94a3b8;">Coords:</span> ${occ.y.toFixed(4)}, ${occ.x.toFixed(4)}
                </div>
            `);
            occurrencesLayer.addLayer(circle);
        });

        const heatPoints = occurrences.map(o => [o.y, o.x, 0.9]);
        for (let i = 0; i < 60; i++) {
            const ref = occurrences[Math.floor(Math.random() * occurrences.length)];
            if (ref) heatPoints.push([ref.y + (Math.random() - 0.5) * 0.2, ref.x + (Math.random() - 0.5) * 0.2, Math.random() * 0.5 + 0.3]);
        }

        heatmapLayer = L.heatLayer(heatPoints, {
            radius: 28, blur: 22, maxZoom: 15, max: 1.0,
            gradient: { 0.0: '#000033', 0.3: '#0000ff', 0.5: '#00ffff', 0.65: '#00ff00', 0.8: '#ffff00', 0.9: '#ff8800', 1.0: '#ff0000' }
        });
        // Don't add to map by default — user toggles it

    } catch (err) {
        console.warn('GeoMiner: Could not load occurrences:', err.message);
    }
}

// ══════════════════════════════════
// Public: re-center map (geocode)
// ══════════════════════════════════
function recenterMap(lat, lon) {
    if (!exploreMap || !activeMarker) return;
    const target = L.latLng(lat, lon);
    exploreMap.setView(target, 11);
    activeMarker.setLatLng(target);
    activeMarker.setPopupContent(makePopup(lat, lon)).openOn(exploreMap);
    if (explorationArea) explorationArea.setLatLng(target);
    updateCoords(lat, lon);
}
