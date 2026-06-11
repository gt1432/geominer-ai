const API_KEY = "80a09e21dad3d9284a10a028a31171bf";

const cropInfo = {
    rice: {
        description: "Requires high rainfall, clayey or loamy soils, and warm temperatures.",
        market: "High",
        season: "Kharif",
        yieldRange: [3.8, 5.2]
    },
    coffee: {
        description: "Grows best in tropical climates with rich, well-draining soils (e.g. Laterite/Red) and shade.",
        market: "Very High",
        season: "Perennial",
        yieldRange: [1.2, 2.2]
    },
    chickpea: {
        description: "Thrives in cool climates with low rainfall and well-aerated light-to-medium soils.",
        market: "High",
        season: "Rabi",
        yieldRange: [1.5, 2.5]
    },
    jute: {
        description: "Needs warm humid climate, alluvial soil, and heavy monsoon rains.",
        market: "Medium",
        season: "Kharif",
        yieldRange: [2.0, 3.2]
    },
    mothbeans: {
        description: "Drought resistant crop suitable for dry regions with sandy soils.",
        market: "Medium",
        season: "Kharif",
        yieldRange: [0.8, 1.5]
    },
    maize: {
        description: "Requires fertile, well-drained soils and moderate, evenly distributed rainfall.",
        market: "High",
        season: "Kharif/Rabi",
        yieldRange: [4.5, 6.2]
    },
    cotton: {
        description: "Needs warm weather, black soils with high water retention, and moderate rainfall.",
        market: "High",
        season: "Kharif",
        yieldRange: [1.8, 2.8]
    }
};

let map = L.map('map').setView([20.5937, 78.9629], 5);

L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '© OpenStreetMap contributors'
    }
).addTo(map);

let marker = null;

function setSoilType() {
    const soil = document.getElementById("soilType").value;
    if (!soil) return;

    if (soil === "alluvial") {
        document.getElementById("n").value = 80;
        document.getElementById("p").value = 40;
        document.getElementById("k").value = 40;
        document.getElementById("ph").value = 6.8;
    } else if (soil === "black") {
        document.getElementById("n").value = 50;
        document.getElementById("p").value = 30;
        document.getElementById("k").value = 70;
        document.getElementById("ph").value = 7.5;
    } else if (soil === "red") {
        document.getElementById("n").value = 40;
        document.getElementById("p").value = 20;
        document.getElementById("k").value = 30;
        document.getElementById("ph").value = 6.0;
    } else if (soil === "laterite") {
        document.getElementById("n").value = 25;
        document.getElementById("p").value = 15;
        document.getElementById("k").value = 25;
        document.getElementById("ph").value = 5.5;
    } else if (soil === "peat") {
        document.getElementById("n").value = 70;
        document.getElementById("p").value = 35;
        document.getElementById("k").value = 30;
        document.getElementById("ph").value = 5.2;
    } else if (soil === "yellow") {
        document.getElementById("n").value = 45;
        document.getElementById("p").value = 25;
        document.getElementById("k").value = 35;
        document.getElementById("ph").value = 6.2;
    } else if (soil === "cinder") {
        document.getElementById("n").value = 30;
        document.getElementById("p").value = 20;
        document.getElementById("k").value = 25;
        document.getElementById("ph").value = 6.5;
    } else if (soil === "sandy") {
        document.getElementById("n").value = 20;
        document.getElementById("p").value = 10;
        document.getElementById("k").value = 15;
        document.getElementById("ph").value = 6.2;
    } else if (soil === "clay") {
        document.getElementById("n").value = 60;
        document.getElementById("p").value = 45;
        document.getElementById("k").value = 50;
        document.getElementById("ph").value = 6.5;
    } else if (soil === "loamy") {
        document.getElementById("n").value = 90;
        document.getElementById("p").value = 50;
        document.getElementById("k").value = 50;
        document.getElementById("ph").value = 6.7;
    } else if (soil === "silt") {
        document.getElementById("n").value = 55;
        document.getElementById("p").value = 35;
        document.getElementById("k").value = 40;
        document.getElementById("ph").value = 6.4;
    } else if (soil === "chalky") {
        document.getElementById("n").value = 30;
        document.getElementById("p").value = 15;
        document.getElementById("k").value = 20;
        document.getElementById("ph").value = 7.8;
    }

    // Check if auto prediction is possible
    checkAndAutoPredict();
}

// Koppen-Geiger Climate Zone Heuristics
function estimateClimateZone(lat, temp, rainfall, elevation) {
    if (elevation > 2000) return "Montane / Alpine Tundra (ET)";
    if (elevation > 1200) return "Subtropical Highland Climate (Cwb)";
    if (rainfall < 400) return "Arid Desert Climate (BWh) / Semi-Arid (BSh)";
    if (rainfall > 2500) return "Tropical Monsoon Climate (Am) / Rainforest (Af)";
    
    // Latitude bands
    const absLat = Math.abs(lat);
    if (absLat < 23.5) {
        if (rainfall < 1000) return "Tropical Semi-Arid (BSh)";
        return "Tropical Wet and Dry Climate (Aw)";
    } else {
        if (rainfall < 800) return "Subtropical Dry / Semi-Arid (BSk)";
        return "Humid Subtropical Climate (Cwa)";
    }
}

map.on('click', async function (e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (marker) {
        map.removeLayer(marker);
    }

    marker = L.marker([lat, lng]).addTo(map);

    const coordsBox = document.getElementById("coords");
    coordsBox.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem;">
            <div class="live-dot" style="background:#10B981; box-shadow:0 0 8px #10B981; width:8px; height:8px; border-radius:50%; animation: livepulse 2s ease-in-out infinite;"></div>
            <span>Analyzing coordinates [${lat.toFixed(4)}, ${lng.toFixed(4)}]...</span>
        </div>
    `;

    try {
        // 1. Nominatim Reverse Geocoding
        const geoResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`, {
            headers: { 'Accept-Language': 'en' }
        });
        const geoData = await geoResponse.json();
        const addr = geoData.address || {};
        
        const district = addr.county || addr.district || addr.state_district || addr.city || addr.town || addr.suburb || "";
        const state = addr.state || "";
        const country = addr.country || "";

        // Check if location is in a water body
        const isWater = addr.water || addr.waterway || addr.sea || addr.ocean || addr.bay || 
                        (geoData.display_name && (geoData.display_name.toLowerCase().includes("ocean") || 
                        geoData.display_name.toLowerCase().includes("sea") || geoData.display_name.toLowerCase().includes("bay")));

        if (isWater || !country) {
            coordsBox.innerHTML = `
                <span style="color:#ef4444; font-weight:700;">⚠️ Location not suitable for agriculture analysis (Water body detected)</span><br>
                Latitude: ${lat.toFixed(4)} | Longitude: ${lng.toFixed(4)}
            `;
            document.getElementById("temperature").value = "";
            document.getElementById("humidity").value = "";
            document.getElementById("rainfall").value = "";
            return;
        }

        // 2. OpenWeatherMap Call
        const weatherResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`
        );
        const weather = await weatherResponse.json();

        // Populate Weather Inputs
        const temp = weather.main.temp;
        const humidity = weather.main.humidity;
        document.getElementById("temperature").value = Math.round(temp);
        document.getElementById("humidity").value = Math.round(humidity);

        // 3. Historical District-Rainfall Fetch from Local Backend
        let rainfallValue = 1000; // default fallback
        if (district) {
            try {
                const rainfallRes = await fetch(`http://${window.location.hostname || 'localhost'}:5000/rainfall?city=${encodeURIComponent(district)}`);
                if (rainfallRes.ok) {
                    const rainfallData = await rainfallRes.json();
                    if (rainfallData.rainfall) {
                        rainfallValue = Math.round(rainfallData.rainfall);
                    }
                }
            } catch (rErr) {
                console.warn("District rainfall fetch failed, using fallback:", rErr);
            }
        }
        document.getElementById("rainfall").value = rainfallValue;

        // 4. Open-Meteo Elevation Fetch
        let elevation = 150; // default
        try {
            const elevRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
            if (elevRes.ok) {
                const elevData = await elevRes.json();
                if (elevData.elevation && elevData.elevation.length > 0) {
                    elevation = Math.round(elevData.elevation[0]);
                }
            }
        } catch (eErr) {
            console.warn("Elevation fetch failed:", eErr);
        }

        // 5. Climate Zone Calculation
        const climateZone = estimateClimateZone(lat, temp, rainfallValue, elevation);

        // Cache location/terrain variables for the result card
        coordsBox.dataset.district = district || "Selected Area";
        coordsBox.dataset.state = state || "";
        coordsBox.dataset.country = country || "";
        coordsBox.dataset.elevation = elevation;
        coordsBox.dataset.climate = climateZone;

        // Render Coordinate details
        let localWarning = "";
        if (country.toLowerCase() !== "india") {
            localWarning = `<div style="font-size:0.75rem; color:#f59e0b; margin-top:0.4rem; font-weight:600;">⚠️ Location outside primary India database; using global model extrapolation.</div>`;
        }

        coordsBox.innerHTML = `
            <div style="font-size:0.9rem; line-height:1.6;">
                <b style="color:#10B981; font-size:1.05rem;">📍 ${district || "Selected Location"}</b>, ${state} (${country})<br>
                <b>Coordinates:</b> ${lat.toFixed(4)} N, ${lng.toFixed(4)} E<br>
                <b>Elevation:</b> ${elevation} meters &nbsp;|&nbsp; <b>Climate:</b> ${climateZone}<br>
                <b>Current Weather:</b> ${temp.toFixed(1)} °C, ${humidity}% Humidity (${weather.weather[0].description})<br>
                <b>Annual Rainfall:</b> ${rainfallValue} mm (resolved via database)
                ${localWarning}
            </div>
        `;

        // Check if auto prediction is possible
        checkAndAutoPredict();

    } catch (error) {
        console.error(error);
        coordsBox.innerHTML = `<span style="color:#ef4444;">❌ Failed to load location weather data. Check your network or OpenWeatherMap API limits.</span>`;
    }
});

function checkAndAutoPredict() {
    const n = document.getElementById("n").value;
    const p = document.getElementById("p").value;
    const k = document.getElementById("k").value;
    const ph = document.getElementById("ph").value;
    const temp = document.getElementById("temperature").value;
    const hum = document.getElementById("humidity").value;
    const rain = document.getElementById("rainfall").value;

    if (n && p && k && ph && temp && hum && rain) {
        predictCrop();
    }
}

async function predictCrop() {
    const resultBox = document.getElementById("result");
    resultBox.style.display = "block";
    resultBox.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; gap:0.5rem; padding:2rem;">
            <div style="border: 3px solid rgba(16,185,129,0.1); border-left-color: #10B981; border-radius:50%; width:24px; height:24px; animation: spin 1s linear infinite;"></div>
            <span style="color:#10B981; font-weight:600;">⏳ Running Crop Recommendation Classifier...</span>
        </div>
    `;

    try {
        const payload = {
            N: parseFloat(document.getElementById("n").value),
            P: parseFloat(document.getElementById("p").value),
            K: parseFloat(document.getElementById("k").value),
            temperature: parseFloat(document.getElementById("temperature").value),
            humidity: parseFloat(document.getElementById("humidity").value),
            ph: parseFloat(document.getElementById("ph").value),
            rainfall: parseFloat(document.getElementById("rainfall").value)
        };

        const response = await fetch(`http://${window.location.hostname || 'localhost'}:5000/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Backend response error");
        const result = await response.json();

        if (result.best_crop && result.best_crop.crop) {
            const cropName = result.best_crop.crop;
            const confidence = result.best_crop.confidence;
            
            // Format Yield Recommendation
            const info = cropInfo[cropName.toLowerCase()] || {
                description: "Suitable for your soil and climate conditions.",
                market: "Moderate",
                season: "Varies",
                yieldRange: [2.0, 4.0]
            };
            
            // Expected Yield Calculation (ranges scaled with confidence)
            const minYield = info.yieldRange[0];
            const maxYield = info.yieldRange[1];
            const estimatedYield = (minYield + (maxYield - minYield) * (confidence / 100)).toFixed(2);

            // Read geo details caches
            const coordsBox = document.getElementById("coords");
            const district = coordsBox.dataset.district || "Selected Area";
            const state = coordsBox.dataset.state || "";
            const region = state ? `${district}, ${state}` : district;
            const elevation = coordsBox.dataset.elevation || "150";
            const climate = coordsBox.dataset.climate || "Humid Subtropical";
            const soilName = document.getElementById("soilType").options[document.getElementById("soilType").selectedIndex].text || "Custom Soil";

            // AI justification builder
            const pHMsg = payload.ph < 5.5 ? "acidic" : payload.ph > 7.5 ? "alkaline" : "neutral";
            const aiJustification = `${cropName.charAt(0).toUpperCase() + cropName.slice(1)} is exceptionally suited for ${region} due to the local temperature of ${payload.temperature}°C and annual average rainfall of ${payload.rainfall}mm, matching the crop's water requirements. The soil N-P-K levels (${payload.N}-${payload.P}-${payload.K}) combined with the slightly ${pHMsg} pH of ${payload.ph} provide an optimal nutrient uptake environment, enhancing predicted yield potential up to ${estimatedYield} tons/hectare.`;

            // Build alternative recommendations html
            let alternativesHtml = "";
            if (result.top3 && result.top3.length > 1) {
                alternativesHtml = `
                    <div style="margin-top: 1.25rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:1rem; border-radius:0.75rem;">
                        <h4 style="font-size:0.8rem; color:#64748b; text-transform:uppercase; font-weight:700; margin-bottom:0.5rem; letter-spacing:0.05em;">Alternative Crops</h4>
                        <div style="display:flex; flex-direction:column; gap:0.5rem;">
                            ${result.top3.slice(1).map((item, idx) => `
                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.88rem;">
                                    <span>${idx + 2}. <strong style="color:#cbd5e1;">${item.crop.charAt(0).toUpperCase() + item.crop.slice(1)}</strong></span>
                                    <span style="color:#84CC16; font-weight:600;">${item.confidence}% Suitability</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // High or Low Suitability Card Style
            const isHighSuitability = confidence >= 50;
            const statusColor = isHighSuitability ? "#10B981" : "#F59E0B";

            resultBox.innerHTML = `
                <div class="prediction-card" style="padding:1.5rem; background:#ffffff; border-radius:1.5rem; box-shadow:0 8px 30px rgba(0,0,0,0.06); animation:fadeIn 0.4s ease; color:#1e293b;">
                    <div style="text-align:center; margin-bottom:1.5rem;">
                        <span style="font-size:3rem;">🌱</span>
                        <h4 style="font-size:0.75rem; color:#64748b; text-transform:uppercase; letter-spacing:0.1em; font-weight:700; margin-top:0.5rem;">Best Recommended Crop</h4>
                        <h2 style="color:${statusColor}; font-size:2.2rem; font-weight:800; margin:0.25rem 0;">${cropName.charAt(0).toUpperCase() + cropName.slice(1)}</h2>
                        <div style="display:inline-flex; align-items:center; gap:0.4rem; background:rgba(16,185,129,0.08); padding:0.35rem 0.85rem; border-radius:99px; font-size:0.8rem; font-weight:700; color:${statusColor}; border:1px solid rgba(16,185,129,0.15);">
                            Suitability Score: ${confidence}%
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:0.75rem; padding:0.85rem; text-align:center;">
                            <span style="font-size:0.7rem; text-transform:uppercase; color:#64748b; font-weight:600; letter-spacing:0.05em;">Expected Yield</span>
                            <div style="font-size:1.15rem; font-weight:700; color:#0f172a; margin-top:0.25rem;">${estimatedYield} Tons/Ha</div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:0.75rem; padding:0.85rem; text-align:center;">
                            <span style="font-size:0.7rem; text-transform:uppercase; color:#64748b; font-weight:600; letter-spacing:0.05em;">Growing Season</span>
                            <div style="font-size:1.15rem; font-weight:700; color:#0f172a; margin-top:0.25rem;">${info.season}</div>
                        </div>
                    </div>

                    <div style="background:#f1f5f9; border-radius:0.75rem; padding:1rem; font-size:0.88rem; line-height:1.6; color:#334155; margin-bottom:1.5rem;">
                        <h4 style="font-size:0.72rem; color:#64748b; text-transform:uppercase; font-weight:700; margin-bottom:0.4rem; letter-spacing:0.05em;">AI Insights & Suitability Justification</h4>
                        ${aiJustification}
                    </div>

                    <!-- Environmental Parameters Table Summary -->
                    <div style="border:1px solid #e2e8f0; border-radius:0.75rem; overflow:hidden;">
                        <div style="background:#f8fafc; padding:0.6rem 0.85rem; font-size:0.75rem; font-weight:700; border-bottom:1px solid #e2e8f0; color:#475569;">ENVIRONMENTAL CLIMATOLOGY PROFILE</div>
                        <table style="width:100%; font-size:0.82rem; border-collapse:collapse; text-align:left;">
                            <tr style="border-bottom:1px solid #e2e8f0;">
                                <td style="padding:0.5rem 0.85rem; color:#64748b;">Soil Profile</td>
                                <td style="padding:0.5rem 0.85rem; font-weight:600; color:#334155;">${soilName}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0;">
                                <td style="padding:0.5rem 0.85rem; color:#64748b;">Avg Temperature</td>
                                <td style="padding:0.5rem 0.85rem; font-weight:600; color:#334155;">${payload.temperature} °C</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0;">
                                <td style="padding:0.5rem 0.85rem; color:#64748b;">Humidity Ratio</td>
                                <td style="padding:0.5rem 0.85rem; font-weight:600; color:#334155;">${payload.humidity} %</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0;">
                                <td style="padding:0.5rem 0.85rem; color:#64748b;">Annual Precipitation</td>
                                <td style="padding:0.5rem 0.85rem; font-weight:600; color:#334155;">${payload.rainfall} mm</td>
                            </tr>
                            <tr>
                                <td style="padding:0.5rem 0.85rem; color:#64748b;">Region / District</td>
                                <td style="padding:0.5rem 0.85rem; font-weight:600; color:#334155;">${region} (Elevation ${elevation}m)</td>
                            </tr>
                        </table>
                    </div>

                    ${alternativesHtml}
                </div>
            `;
        } else {
            resultBox.innerHTML = `<div style="padding:1rem; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:0.75rem; color:#ef4444; text-align:center;">❌ Prediction failed: ${result.error || 'Server error'}</div>`;
        }

    } catch (error) {
        console.error(error);
        resultBox.innerHTML = `
            <div style="padding:1.25rem; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:0.75rem; color:#d97706; text-align:center; font-size:0.9rem;">
                ⚠️ Could not connect to crop prediction server on port 5000. Please ensure the backend is started via: <code>python app.py</code>
            </div>
        `;
    }
}

// Soil Camera & Gallery Image Classification
async function handleSoilImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const preview = document.getElementById("preview");
    const soilResult = document.getElementById("soilResult");

    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    
    soilResult.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; color:#10B981; font-weight:600;">
            <div style="border: 2px solid rgba(16,185,129,0.1); border-left-color: #10B981; border-radius:50%; width:16px; height:16px; animation: spin 1s linear infinite;"></div>
            <span>AI analyzing soil image...</span>
        </div>
    `;

    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch(`http://${window.location.hostname || 'localhost'}:5001/predict-soil`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) throw new Error("Soil classification failed");
        const data = await response.json();

        // Display properties details
        soilResult.innerHTML = `
            <div class="soil-card" style="margin-top:0.75rem; padding:1rem; background:rgba(16,185,129,0.08); border-left:4px solid #10B981; border-radius:0.5rem; font-size:0.85rem; color:#cbd5e1; line-height:1.5;">
                <div style="font-weight:700; color:#10B981; font-size:0.95rem; display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                    <span>AI Detected: ${data.soil}</span>
                    <span style="font-size:0.78rem; font-weight:600; color:#84CC16;">Confidence: ${data.confidence}%</span>
                </div>
                <div style="margin-bottom:0.25rem;"><b>Soil Features:</b> ${data.characteristics}</div>
                <div style="margin-bottom:0.25rem;"><b>Water Retention:</b> ${data.retention} &nbsp;|&nbsp; <b>Fertility:</b> ${data.fertility} &nbsp;|&nbsp; <b>Drainage:</b> ${data.drainage}</div>
                <div><b>Suitable Crops:</b> ${data.suitable}</div>
            </div>
        `;

        // Update the Dropdown & Trigger Soil updates
        const soilKey = data.soil.toLowerCase().split(' ')[0];
        const soilSelect = document.getElementById("soilType");
        
        let matched = false;
        for (let i = 0; i < soilSelect.options.length; i++) {
            if (soilSelect.options[i].value === soilKey) {
                soilSelect.selectedIndex = i;
                matched = true;
                break;
            }
        }
        if (!matched) {
            // Check full matching name
            for (let i = 0; i < soilSelect.options.length; i++) {
                if (soilSelect.options[i].text.toLowerCase().includes(soilKey)) {
                    soilSelect.selectedIndex = i;
                    break;
                }
            }
        }

        // Set soil properties N, P, K, pH and check prediction
        setSoilType();

    } catch (error) {
        console.error(error);
        soilResult.innerHTML = `<div style="color:#ef4444; font-size:0.85rem; font-weight:600;">❌ Soil classification server on port 5001 is offline. Check connection.</div>`;
    }
}

document.getElementById("galleryInput").addEventListener("change", handleSoilImage);
document.getElementById("cameraInput").addEventListener("change", handleSoilImage);