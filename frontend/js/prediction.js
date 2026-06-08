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

// Handle prediction submit
async function handlePredictionSubmit(e) {
    e.preventDefault();
    
    const lat = parseFloat(document.getElementById('inp-lat').value);
    const lon = parseFloat(document.getElementById('inp-lon').value);
    const alt = parseFloat(document.getElementById('inp-alt').value || 450.0);
    const fe = parseFloat(document.getElementById('inp-fe').value || 5.0);
    const cu = parseFloat(document.getElementById('inp-cu').value || 30.0);
    const zn = parseFloat(document.getElementById('inp-zn').value || 60.0);
    const rock_type = document.getElementById('sel-rock-type').value;
    
    // Activate fullscreen loading spinner screen
    const loadingScreen = document.getElementById('pred-loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('active');
    }
    
    const payload = {
        latitude: lat,
        longitude: lon,
        altitude: alt,
        fe: fe,
        cu: cu,
        zn: zn,
        rock_type: rock_type
    };
    
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
        
        // Cache result in sessionStorage
        sessionStorage.setItem('latest_prediction', JSON.stringify(data));
        sessionStorage.setItem('input_fe', fe);
        sessionStorage.setItem('input_cu', cu);
        sessionStorage.setItem('input_zn', zn);
        
        // Redirect to results details page
        window.location.href = 'results.html';
        
    } catch (err) {
        alert(`Prediction Error: ${err.message}`);
        if (loadingScreen) {
            loadingScreen.classList.remove('active');
        }
    }
}

// Handle location name geocoding search
async function handleGeocodeSearch() {
    const query = document.getElementById('loc-search-input').value.trim();
    if (!query) {
        alert('Please enter a location name to search.');
        return;
    }
    
    const savedKey = localStorage.getItem('google_maps_key') || '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/geocode?q=${encodeURIComponent(query)}&key=${encodeURIComponent(savedKey)}`);
        if (!response.ok) {
            throw new Error('Geocoding search failed.');
        }
        
        const data = await response.json();
        if (data.success) {
            // Update input coordinates
            document.getElementById('inp-lat').value = data.latitude.toFixed(5);
            document.getElementById('inp-lon').value = data.longitude.toFixed(5);
            
            // Recenter Leaflet Map
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

// Load and populate results.html view
function loadPredictionResults() {
    const rawData = sessionStorage.getItem('latest_prediction');
    if (!rawData) {
        // Redirect back to query page if empty
        window.location.href = 'predict.html';
        return;
    }
    
    const data = JSON.parse(rawData);
    
    // Populate text content
    document.getElementById('res-score').textContent = `${data.mineral_probability}%`;
    document.getElementById('res-lat').textContent = data.latitude.toFixed(5);
    document.getElementById('res-lon').textContent = data.longitude.toFixed(5);
    
    if (document.getElementById('res-alt')) {
        document.getElementById('res-alt').textContent = data.altitude ? `${data.altitude.toFixed(1)} m` : '450.0 m';
    }
    
    document.getElementById('res-formation').textContent = data.geological_zone;
    document.getElementById('res-rock-type').textContent = data.rock_type;
    document.getElementById('res-nearest-target').textContent = `${data.nearest_mineral} (${data.nearest_mineral_dist_km.toFixed(2)} km away)`;
    
    // Confidence badge
    const badge = document.getElementById('res-confidence-badge');
    badge.textContent = data.confidence;
    badge.className = `badge ${getConfidenceBadgeClass(data.confidence)}`;
    
    // PDF link mapping
    document.getElementById('btn-pdf-download').href = `${API_BASE_URL}/predictions/${data._id}/pdf`;
    
    // Populating likely minerals checklist with percentages
    const listContainer = document.getElementById('res-minerals-list');
    listContainer.innerHTML = '';
    
    const minerals = data.predicted_minerals || [];
    const percentages = data.mineral_percentages || {};
    if (minerals.length > 0) {
        minerals.forEach(min => {
            const pct = percentages[min] !== undefined ? percentages[min] : 1.5;
            let pctStr = '';
            if (pct < 0.001) {
                pctStr = `${(pct * 100).toFixed(6)}%`;
            } else if (pct < 1.0) {
                pctStr = `${pct.toFixed(4)}%`;
            } else {
                pctStr = `${pct.toFixed(2)}%`;
            }
            const p = document.createElement('p');
            p.style.margin = '4px 0';
            p.style.fontWeight = '500';
            p.style.fontSize = '0.95rem';
            p.style.color = '#f1f5f9';
            p.innerHTML = `<i class="fa-solid fa-square-check" style="color: var(--success); margin-right: 6px;"></i> ${min} (${pctStr})`;
            listContainer.appendChild(p);
        });
    } else {
        listContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">None identified</p>';
    }
    
    // Load Results Map and Heatmap
    if (typeof L !== 'undefined' && document.getElementById('results-explore-map')) {
        fetch(`${API_BASE_URL}/occurrences`)
            .then(res => res.json())
            .then(occurrences => {
                initResultsMap(data.latitude, data.longitude, occurrences);
            })
            .catch(err => {
                console.error('Failed to load occurrences for results map:', err);
                initResultsMap(data.latitude, data.longitude, []);
            });
    }
}

// Initialize Leaflet Map on Results Page
function initResultsMap(lat, lon, occurrences) {
    const map = L.map('results-explore-map').setView([lat, lon], 11);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
    
    // Place exploration target marker
    L.marker([lat, lon]).addTo(map).bindPopup("Prediction Target Location").openPopup();
    
    // Draw 5km radius exploration circle
    L.circle([lat, lon], {
        radius: 5000,
        color: '#0284c7',
        fillColor: '#0284c7',
        fillOpacity: 0.1,
        weight: 1.5,
        dashArray: '5, 5'
    }).addTo(map);
    
    // Populate Heatmap
    if (occurrences && occurrences.length > 0) {
        const heatPoints = occurrences.map(occ => [occ.y, occ.x, 0.8]);
        heatPoints.push([lat, lon, 1.0]); // Add target hotspot
        
        L.heatLayer(heatPoints, {
            radius: 25,
            blur: 20,
            maxZoom: 14,
            max: 1.0,
            gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
        }).addTo(map);
        
        // Add markers for nearby known deposits
        occurrences.forEach(occ => {
            const dist = Math.sqrt((occ.y - lat)**2 + (occ.x - lon)**2) * 111.0;
            if (dist <= 25.0) { // Limit to 25km radius
                const circle = L.circleMarker([occ.y, occ.x], {
                    radius: 5,
                    fillColor: occ.type.toLowerCase() !== 'mineralization' ? 'orange' : 'red',
                    color: '#ffffff',
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.8
                }).addTo(map);
                circle.bindPopup(`<b>${occ.type} Occurrence</b><br/>Commodity: ${occ.commodity}<br/>Proximity: ${dist.toFixed(2)} km`);
            }
        });
    }
}
