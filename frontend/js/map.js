// GIS Map Handler for GeoMiner AI
let exploreMap = null;
let activeMarker = null;
let heatmapLayer = null;
let occurrencesLayer = null;
let explorationArea = null;

document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('leaflet-explore-map');
    if (!mapContainer) return; // Only run on predict page
    
    // Initial centering coordinates (Chitradurga, Karnataka)
    const startLat = 14.2207;
    const startLon = 76.2385;
    
    // Initialize Leaflet Map
    exploreMap = L.map('leaflet-explore-map').setView([startLat, startLon], 10);
    
    // Dark Matter Premium Map Tiles (CartoDB)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).add_to(exploreMap);
    
    // Add default active marker
    activeMarker = L.marker([startLat, startLon], { draggable: true }).addTo(exploreMap);
    activeMarker.bindPopup("Selected Exploration Target").openPopup();
    
    // Add exploration area circle (5km radius)
    explorationArea = L.circle([startLat, startLon], {
        radius: 5000,
        color: '#0284c7',
        fillColor: '#0284c7',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '5, 5'
    }).addTo(exploreMap);
    
    // Update inputs when marker is dragged
    activeMarker.on('dragend', function(e) {
        const position = activeMarker.getLatLng();
        const lat = position.lat;
        const lon = position.lng;
        document.getElementById('inp-lat').value = lat.toFixed(5);
        document.getElementById('inp-lon').value = lon.toFixed(5);
        if (explorationArea) {
            explorationArea.setLatLng([lat, lon]);
        }
    });
    
    // Map Click Handler: Place marker and auto-update coordinate values
    exploreMap.on('click', (e) => {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        
        // Relocate marker and circle
        activeMarker.setLatLng([lat, lon]);
        activeMarker.getPopup().setContent(`Latitude: ${lat.toFixed(5)}<br/>Longitude: ${lon.toFixed(5)}`);
        if (explorationArea) {
            explorationArea.setLatLng([lat, lon]);
        }
        
        // Auto-populate form coordinates
        document.getElementById('inp-lat').value = lat.toFixed(5);
        document.getElementById('inp-lon').value = lon.toFixed(5);
    });
    
    // Create layer groups
    occurrencesLayer = L.layerGroup().addTo(exploreMap);
    
    // Load and render known mineral occurrences & heatmap points
    loadOccurrencesAndHeatmap();
    
    // Layer Toggles listeners
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
});

// Fetch occurrences from Express server
async function loadOccurrencesAndHeatmap() {
    try {
        const response = await fetch(`${API_BASE_URL}/occurrences`);
        if (!response.ok) return;
        
        const occurrences = await response.json();
        
        // 1. Add markers to the map
        occurrences.forEach(occ => {
            const isMine = occ.type.toLowerCase() !== 'mineralization';
            const color = isMine ? 'orange' : 'red';
            
            // Custom Circle Marker
            const circle = L.circleMarker([occ.y, occ.x], {
                radius: 6,
                fillColor: color,
                color: '#ffffff',
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.8
            });
            
            circle.bindPopup(`<b>${occ.type} Occurrence</b><br/>Commodity: ${occ.commodity}`);
            occurrencesLayer.addLayer(circle);
        });
        
        // 2. Add Heatmap
        // Create heatmap points using locations (with a dummy intensity for potential)
        const heatPoints = occurrences.map(occ => [occ.y, occ.x, 0.8]);
        
        // Add some random background high-potential grids around known districts to simulate density
        // from our NGCM dataset bounds
        // Bbox: xmin=76.01, ymin=13.76, xmax=77.75, ymax=15.74
        for (let i = 0; i < 40; i++) {
            // center around occurrences
            const ref = occurrences[Math.floor(Math.random() * occurrences.length)];
            if (ref) {
                const dy = (Math.random() - 0.5) * 0.15;
                const dx = (Math.random() - 0.5) * 0.15;
                heatPoints.push([ref.y + dy, ref.x + dx, 0.5]);
            }
        }
        
        heatmapLayer = L.heatLayer(heatPoints, {
            radius: 25,
            blur: 20,
            maxZoom: 14,
            max: 1.0,
            gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
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
        activeMarker.getPopup().setContent(`Latitude: ${lat.toFixed(5)}<br/>Longitude: ${lon.toFixed(5)}`).openOn(exploreMap);
        if (explorationArea) {
            explorationArea.setLatLng(target);
        }
    }
}
