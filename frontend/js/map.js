// GIS Map Handler for GeoMiner AI
let exploreMap = null;
let activeMarker = null;
let heatmapLayer = null;
let occurrencesLayer = null;
let explorationArea = null;
let selectionRect = null;
let selectionMode = 'point'; // 'point' or 'area'
let drawStart = null;

document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('leaflet-explore-map');
    if (!mapContainer) return; // Only run on predict page

    // Initial centering coordinates (Chitradurga, Karnataka)
    const startLat = 14.2207;
    const startLon = 76.2385;

    // Initialize Leaflet Map
    exploreMap = L.map('leaflet-explore-map', { zoomControl: true }).setView([startLat, startLon], 10);

    // Dark Matter Premium Map Tiles (CartoDB)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(exploreMap);

    // Add default active marker (draggable)
    activeMarker = L.marker([startLat, startLon], { draggable: true }).addTo(exploreMap);
    activeMarker.bindPopup(`
        <div style="font-family:sans-serif;min-width:150px;">
            <b style="color:#38bdf8;">📍 Exploration Target</b><br/>
            <span>Lat: ${startLat.toFixed(5)}</span><br/>
            <span>Lon: ${startLon.toFixed(5)}</span>
        </div>
    `).openPopup();

    // Add exploration area circle (5km radius)
    explorationArea = L.circle([startLat, startLon], {
        radius: 5000,
        color: '#38bdf8',
        fillColor: '#0284c7',
        fillOpacity: 0.12,
        weight: 1.8,
        dashArray: '6, 4'
    }).addTo(exploreMap);

    // Update inputs when marker is dragged
    activeMarker.on('dragend', function() {
        const pos = activeMarker.getLatLng();
        updateCoords(pos.lat, pos.lng);
        if (explorationArea) explorationArea.setLatLng([pos.lat, pos.lng]);
    });

    // Map Click Handler
    exploreMap.on('click', (e) => {
        if (selectionMode === 'area') return; // handled separately
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        activeMarker.setLatLng([lat, lon]);
        activeMarker.getPopup().setContent(`
            <div style="font-family:sans-serif;min-width:150px;">
                <b style="color:#38bdf8;">📍 Exploration Target</b><br/>
                <span>Lat: ${lat.toFixed(5)}</span><br/>
                <span>Lon: ${lon.toFixed(5)}</span>
            </div>
        `);
        if (explorationArea) explorationArea.setLatLng([lat, lon]);
        updateCoords(lat, lon);
    });

    // Rectangle area selection handler
    exploreMap.on('mousedown', function(e) {
        if (selectionMode !== 'area') return;
        exploreMap.dragging.disable();
        drawStart = e.latlng;

        if (selectionRect) {
            exploreMap.removeLayer(selectionRect);
            selectionRect = null;
        }

        selectionRect = L.rectangle([drawStart, drawStart], {
            color: '#a855f7',
            fillColor: '#7c3aed',
            fillOpacity: 0.15,
            weight: 2,
            dashArray: '4, 3'
        }).addTo(exploreMap);
    });

    exploreMap.on('mousemove', function(e) {
        if (selectionMode !== 'area' || !drawStart || !selectionRect) return;
        selectionRect.setBounds(L.latLngBounds(drawStart, e.latlng));
    });

    exploreMap.on('mouseup', function(e) {
        if (selectionMode !== 'area' || !drawStart) return;
        exploreMap.dragging.enable();
        const bounds = L.latLngBounds(drawStart, e.latlng);
        const center = bounds.getCenter();
        // Snap marker to center of selection
        activeMarker.setLatLng(center);
        if (explorationArea) explorationArea.setLatLng(center);
        updateCoords(center.lat, center.lng);
        // Show area dimensions in popup
        const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth()) * 111;
        const lonSpan = Math.abs(bounds.getEast() - bounds.getWest()) * 111 * Math.cos(center.lat * Math.PI / 180);
        activeMarker.bindPopup(`
            <div style="font-family:sans-serif;min-width:160px;">
                <b style="color:#a855f7;">🟪 Selected Area</b><br/>
                <span>Center Lat: ${center.lat.toFixed(5)}</span><br/>
                <span>Center Lon: ${center.lng.toFixed(5)}</span><br/>
                <span>Area: ~${latSpan.toFixed(1)} × ${lonSpan.toFixed(1)} km</span>
            </div>
        `).openPopup();
        selectionRect.bindPopup(`
            <div style="font-family:sans-serif;">
                <b style="color:#a855f7;">📐 Area Selection</b><br/>
                N: ${bounds.getNorth().toFixed(4)} | S: ${bounds.getSouth().toFixed(4)}<br/>
                E: ${bounds.getEast().toFixed(4)} | W: ${bounds.getWest().toFixed(4)}<br/>
                Size: ~${latSpan.toFixed(1)} × ${lonSpan.toFixed(1)} km
            </div>
        `);
        drawStart = null;
    });

    // Create layer groups
    occurrencesLayer = L.layerGroup().addTo(exploreMap);

    // Load and render known mineral occurrences & heatmap
    loadOccurrencesAndHeatmap();

    // Layer Toggles
    document.getElementById('chk-heatmap').addEventListener('change', function() {
        if (this.checked) {
            if (heatmapLayer) exploreMap.addLayer(heatmapLayer);
        } else {
            if (heatmapLayer) exploreMap.removeLayer(heatmapLayer);
        }
    });

    document.getElementById('chk-mines').addEventListener('change', function() {
        if (this.checked) {
            exploreMap.addLayer(occurrencesLayer);
        } else {
            exploreMap.removeLayer(occurrencesLayer);
        }
    });

    // Selection mode toggle buttons
    const btnPoint = document.getElementById('btn-mode-point');
    const btnArea = document.getElementById('btn-mode-area');
    if (btnPoint && btnArea) {
        btnPoint.addEventListener('click', () => {
            selectionMode = 'point';
            btnPoint.classList.add('active');
            btnArea.classList.remove('active');
            exploreMap.dragging.enable();
            if (selectionRect) { exploreMap.removeLayer(selectionRect); selectionRect = null; }
            exploreMap.getContainer().style.cursor = 'crosshair';
        });
        btnArea.addEventListener('click', () => {
            selectionMode = 'area';
            btnArea.classList.add('active');
            btnPoint.classList.remove('active');
            exploreMap.getContainer().style.cursor = 'crosshair';
        });
    }

    // Default cursor
    exploreMap.getContainer().style.cursor = 'crosshair';
});

// Helper: update coordinate inputs
function updateCoords(lat, lon) {
    const latInput = document.getElementById('inp-lat');
    const lonInput = document.getElementById('inp-lon');
    if (latInput) latInput.value = lat.toFixed(5);
    if (lonInput) lonInput.value = lon.toFixed(5);
}

// Fetch occurrences from Express server and render heatmap + markers
async function loadOccurrencesAndHeatmap() {
    try {
        const response = await fetch(`${API_BASE_URL}/occurrences`);
        if (!response.ok) return;

        const occurrences = await response.json();

        // 1. Add circle markers for known mineral occurrences
        occurrences.forEach(occ => {
            const isMine = occ.type.toLowerCase().includes('quarry') || occ.type.toLowerCase().includes('mine');
            const color = isMine ? '#f59e0b' : '#ef4444';
            const circle = L.circleMarker([occ.y, occ.x], {
                radius: 7,
                fillColor: color,
                color: '#ffffff',
                weight: 1.2,
                opacity: 0.9,
                fillOpacity: 0.85
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

        // 2. Build heatmap from occurrences + density fill
        const heatPoints = occurrences.map(occ => [occ.y, occ.x, 0.9]);
        // Add background noise around known sites
        for (let i = 0; i < 60; i++) {
            const ref = occurrences[Math.floor(Math.random() * occurrences.length)];
            if (ref) {
                const dy = (Math.random() - 0.5) * 0.2;
                const dx = (Math.random() - 0.5) * 0.2;
                heatPoints.push([ref.y + dy, ref.x + dx, Math.random() * 0.5 + 0.3]);
            }
        }

        heatmapLayer = L.heatLayer(heatPoints, {
            radius: 28,
            blur: 22,
            maxZoom: 15,
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
        }).addTo(exploreMap);

    } catch (err) {
        console.error('Failed to load occurrences for Leaflet map:', err);
    }
}

// Center map to specified coordinates (called during geocoding search)
function recenterMap(lat, lon) {
    if (exploreMap && activeMarker) {
        const target = L.latLng(lat, lon);
        exploreMap.setView(target, 11);
        activeMarker.setLatLng(target);
        activeMarker.getPopup().setContent(`
            <div style="font-family:sans-serif;min-width:150px;">
                <b style="color:#38bdf8;">📍 Exploration Target</b><br/>
                <span>Lat: ${lat.toFixed(5)}</span><br/>
                <span>Lon: ${lon.toFixed(5)}</span>
            </div>
        `).openOn(exploreMap);
        if (explorationArea) explorationArea.setLatLng(target);
        updateCoords(lat, lon);
    }
}
