const { execFile } = require('child_process');
const path = require('path');
const PDFDocument = require('pdfkit');
const { dbService } = require('../database/mongodb_connection');

// Constants
const PYTHON_PATH = process.env.PYTHON_PATH || 'C:\\Python312\\python.exe';
const PREDICT_SCRIPT_PATH = path.join(__dirname, '..', '..', 'ml', 'predict.py');

// 1. Process prediction request
exports.predictMineralPotential = async (req, res) => {
    try {
        const { latitude, longitude, fe, cu, zn, rock_type, altitude } = req.body;
        
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'Latitude and Longitude are required fields.' });
        }
        
        // Define default values if override element feeds are omitted
        const cleanFe = fe !== undefined ? parseFloat(fe) : 5.0;
        const cleanCu = cu !== undefined ? parseFloat(cu) : 30.0;
        const cleanZn = zn !== undefined ? parseFloat(zn) : 60.0;
        const cleanRock = rock_type || 'Granite';
        const cleanAlt = altitude !== undefined ? parseFloat(altitude) : 450.0;
        
        // Command line arguments for Python subprocess
        const args = [
            PREDICT_SCRIPT_PATH,
            '--latitude', latitude.toString(),
            '--longitude', longitude.toString(),
            '--fe', cleanFe.toString(),
            '--cu', cleanCu.toString(),
            '--zn', cleanZn.toString(),
            '--rock_type', cleanRock,
            '--altitude', cleanAlt.toString()
        ];
        
        // Spawn Python ML subprocess
        execFile(PYTHON_PATH, args, async (error, stdout, stderr) => {
            if (error) {
                console.error('Python prediction execution failed:', error, stderr);
                return res.status(500).json({ 
                    error: 'Machine learning subprocess error.',
                    details: error.message,
                    stderr: stderr
                });
            }
            
            try {
                // Parse python output stdout JSON
                const mlResult = JSON.parse(stdout.trim());
                
                if (mlResult.error) {
                    return res.status(500).json({ error: 'ML script logic error', details: mlResult.error });
                }
                
                // Construct log entry
                const logData = {
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude),
                    fe: cleanFe,
                    cu: cleanCu,
                    zn: cleanZn,
                    rock_type: cleanRock,
                    altitude: mlResult.altitude !== undefined ? mlResult.altitude : cleanAlt,
                    mineral_probability: mlResult.mineral_probability,
                    predicted_minerals: mlResult.predicted_minerals,
                    mineral_percentages: mlResult.mineral_percentages || {},
                    confidence: mlResult.confidence,
                    geological_zone: mlResult.geological_zone,
                    nearest_mineral: mlResult.nearest_mineral,
                    nearest_mineral_dist_km: mlResult.nearest_mineral_dist_km
                };
                
                // Save to database
                const savedLog = await dbService.savePrediction(logData);
                
                // Return prediction matching the requested API output
                return res.status(200).json({
                    _id: savedLog._id,
                    latitude: savedLog.latitude,
                    longitude: savedLog.longitude,
                    altitude: savedLog.altitude,
                    mineral_probability: mlResult.mineral_probability,
                    predicted_minerals: mlResult.predicted_minerals,
                    mineral_percentages: mlResult.mineral_percentages || {},
                    confidence: mlResult.confidence,
                    geological_zone: mlResult.geological_zone,
                    nearest_mineral: mlResult.nearest_mineral,
                    nearest_mineral_dist_km: mlResult.nearest_mineral_dist_km,
                    rock_type: savedLog.rock_type
                });
            } catch (parseErr) {
                console.error('Failed to parse Python JSON output. Output was:', stdout);
                return res.status(500).json({ error: 'Failed to parse ML output.', raw: stdout });
            }
        });
        
    } catch (err) {
        console.error('Controller error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// 2. Fetch all predictions history log list
exports.getPredictionsHistory = async (req, res) => {
    try {
        const history = await dbService.getPredictions();
        return res.status(200).json(history);
    } catch (err) {
        console.error('Failed to fetch predictions history:', err);
        return res.status(500).json({ error: 'Failed to retrieve logs.' });
    }
};

// 3. Fetch dashboard stats & summary charts data
exports.getDashboardStats = async (req, res) => {
    try {
        const stats = await dbService.getStats();
        return res.status(200).json(stats);
    } catch (err) {
        console.error('Failed to fetch stats:', err);
        return res.status(500).json({ error: 'Failed to retrieve dashboard stats.' });
    }
};

// 4. Generate downloadable PDF Report
exports.downloadPdfReport = async (req, res) => {
    try {
        const { id } = req.params;
        const record = await dbService.getPredictionById(id);
        
        if (!record) {
            return res.status(404).json({ error: 'Prediction record not found.' });
        }
        
        // Setup PDF Document with size A4
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const filename = `geominer-report-${id.substring(0, 8)}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        doc.pipe(res);
        
        // ─── COLOR PALETTE ───
        const C_DARK       = '#0f172a';
        const C_BLUE       = '#0284c7';
        const C_BLUE_LIGHT = '#38bdf8';
        const C_PURPLE     = '#7c3aed';
        const C_GREEN      = '#10b981';
        const C_AMBER      = '#f59e0b';
        const C_RED        = '#ef4444';
        const C_GRAY       = '#64748b';
        const C_LIGHT_BG   = '#f8fafc';
        const C_CARD_BG    = '#f1f5f9';
        
        const PAGE_W = doc.page.width;
        const MARGIN = 50;
        const CONTENT_W = PAGE_W - MARGIN * 2;
        
        // ─── HELPER FUNCTIONS ───
        const drawHRule = (y, color = '#e2e8f0', width = 1) => {
            doc.strokeColor(color).lineWidth(width)
               .moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
        };
        
        const drawBox = (x, y, w, h, fillColor = C_CARD_BG, strokeColor = '#e2e8f0') => {
            doc.roundedRect(x, y, w, h, 6)
               .fillColor(fillColor).fill()
               .strokeColor(strokeColor).lineWidth(0.5).stroke();
        };
        
        const sectionHeader = (title, y) => {
            doc.rect(MARGIN, y, 3, 18).fillColor(C_BLUE).fill();
            doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(13)
               .text(title, MARGIN + 10, y + 1);
            return y + 28;
        };
        
        const formatPct = (pct) => {
            if (pct === undefined || pct === null) return '1.50%';
            if (pct < 0.001) return `${(pct * 100).toFixed(6)}%`;
            if (pct < 0.01)  return `${pct.toFixed(5)}%`;
            if (pct < 1.0)   return `${pct.toFixed(3)}%`;
            return `${pct.toFixed(2)}%`;
        };
        
        // ═══════════════════════════════════════════
        // HEADER BANNER
        // ═══════════════════════════════════════════
        doc.rect(0, 0, PAGE_W, 100).fillColor(C_DARK).fill();
        
        // Brand name
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24)
           .text('GEOMINER AI', MARGIN, 28);
        doc.fillColor(C_BLUE_LIGHT).font('Helvetica').fontSize(9)
           .text('MINERAL INTELLIGENCE & GEOLOGICAL DISCOVERY PLATFORM', MARGIN, 56);
        
        // Report meta (right side)
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
           .text(`Report ID: ${id}`, MARGIN, 28, { align: 'right', width: CONTENT_W })
           .text(`Generated: ${new Date(record.createdAt || Date.now()).toLocaleString('en-IN')}`, MARGIN, 40, { align: 'right', width: CONTENT_W })
           .text(`Coordinates: ${record.latitude.toFixed(5)}°N, ${record.longitude.toFixed(5)}°E`, MARGIN, 52, { align: 'right', width: CONTENT_W })
           .text(`Altitude: ${(record.altitude || 450.0).toFixed(1)} m (AMSL)`, MARGIN, 64, { align: 'right', width: CONTENT_W });
        
        let curY = 118;
        
        // ═══════════════════════════════════════════
        // SECTION 1: EXECUTIVE SUMMARY
        // ═══════════════════════════════════════════
        curY = sectionHeader('1. Executive Summary', curY);
        
        // Score box (left)
        drawBox(MARGIN, curY, 155, 80, C_CARD_BG);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text('MINERAL POTENTIAL SCORE', MARGIN + 10, curY + 10);
        doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(32)
           .text(`${record.mineral_probability}%`, MARGIN + 10, curY + 24);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
           .text('AI computed probability vs. known deposits', MARGIN + 10, curY + 62, { width: 130 });
        
        // Confidence box (center)
        const confColor = record.confidence === 'High' ? C_RED : (record.confidence === 'Medium' ? C_AMBER : C_GREEN);
        drawBox(MARGIN + 165, curY, 150, 80, C_CARD_BG);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text('CONFIDENCE RATING', MARGIN + 175, curY + 10);
        doc.fillColor(confColor).font('Helvetica-Bold').fontSize(26)
           .text(record.confidence || 'Medium', MARGIN + 175, curY + 28);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
           .text('Exploration risk classification index', MARGIN + 175, curY + 62, { width: 130 });
        
        // Nearest target box (right)
        drawBox(MARGIN + 325, curY, 185, 80, C_CARD_BG);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text('NEAREST KNOWN TARGET', MARGIN + 335, curY + 10);
        doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(11)
           .text(record.nearest_mineral || 'Quartzite', MARGIN + 335, curY + 28, { width: 160 });
        doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(14)
           .text(`${(record.nearest_mineral_dist_km || 0).toFixed(2)} km`, MARGIN + 335, curY + 48);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
           .text('from selected target point', MARGIN + 335, curY + 65);
        
        curY += 98;
        drawHRule(curY, '#e2e8f0');
        curY += 16;
        
        // ═══════════════════════════════════════════
        // SECTION 2: SPATIAL & GEOGRAPHIC DETAILS
        // ═══════════════════════════════════════════
        curY = sectionHeader('2. Spatial & Geographic Information', curY);
        
        drawBox(MARGIN, curY, CONTENT_W, 90, C_LIGHT_BG);
        
        const col1X = MARGIN + 12;
        const col2X = MARGIN + 130;
        const col3X = MARGIN + 290;
        const col4X = MARGIN + 420;
        
        // Row 1
        const r1Y = curY + 14;
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
           .text('LATITUDE', col1X, r1Y).text('LONGITUDE', col2X, r1Y)
           .text('ALTITUDE (AMSL)', col3X, r1Y).text('ROCK TYPE', col4X, r1Y);
        
        doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(11)
           .text(`${record.latitude.toFixed(5)}°N`, col1X, r1Y + 12)
           .text(`${record.longitude.toFixed(5)}°E`, col2X, r1Y + 12)
           .text(`${(record.altitude || 450.0).toFixed(1)} m`, col3X, r1Y + 12)
           .text(record.rock_type || 'Granite', col4X, r1Y + 12, { width: 130 });
        
        // Row 2
        const r2Y = curY + 54;
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
           .text('GEOLOGICAL ZONE', col1X, r2Y)
           .text('NEAREST MINERAL (DIST)', col3X, r2Y);
        
        doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(9.5)
           .text(record.geological_zone || 'Vanivilas Formation', col1X, r2Y + 12, { width: 240 })
           .text(`${record.nearest_mineral || 'Quartzite'} — ${(record.nearest_mineral_dist_km || 0).toFixed(2)} km`, col3X, r2Y + 12, { width: 240 });
        
        curY += 108;
        drawHRule(curY, '#e2e8f0');
        curY += 16;
        
        // ═══════════════════════════════════════════
        // SECTION 3: MINERAL INVENTORY
        // ═══════════════════════════════════════════
        curY = sectionHeader('3. Detected Mineral Inventory with Estimated Concentrations', curY);
        
        const minerals   = record.predicted_minerals || [];
        const pctMap     = record.mineral_percentages || {};
        
        if (minerals.length > 0) {
            // Table header
            drawBox(MARGIN, curY, CONTENT_W, 22, C_DARK);
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
               .text('Mineral Name', MARGIN + 12, curY + 7)
               .text('Est. Concentration (%)', MARGIN + 200, curY + 7)
               .text('Enrichment Class', MARGIN + 340, curY + 7)
               .text('Indicator Elements', MARGIN + 440, curY + 7);
            curY += 22;
            
            const MINERAL_ELEMENTS = {
                'Iron':      'Fe₂O₃ oxide',
                'Copper':    'Cu (ppm)',
                'Zinc':      'Zn (ppm)',
                'Gold':      'Au (ppb)',
                'Manganese': 'MnO oxide',
                'Nickel':    'Ni (ppm)',
                'Lead':      'Pb (ppm)',
                'Chromium':  'Cr (ppm)',
                'Quartzite': 'SiO₂ silica',
                'Clay':      'Al₂O₃ oxide'
            };
            
            minerals.forEach((min, idx) => {
                const pct = pctMap[min] !== undefined ? pctMap[min] : 1.5;
                const pctStr = formatPct(pct);
                const rowBg = idx % 2 === 0 ? '#ffffff' : C_LIGHT_BG;
                const enrichClass = pct > 5 ? 'HIGH' : (pct > 1 ? 'MODERATE' : 'TRACE');
                const enrichColor = pct > 5 ? C_RED : (pct > 1 ? C_AMBER : C_GRAY);
                const elemStr = MINERAL_ELEMENTS[min] || 'Multi-element';
                
                drawBox(MARGIN, curY, CONTENT_W, 22, rowBg, '#e2e8f0');
                doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(9)
                   .text(min, MARGIN + 12, curY + 7);
                doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(9)
                   .text(pctStr, MARGIN + 200, curY + 7);
                doc.fillColor(enrichColor).font('Helvetica-Bold').fontSize(8)
                   .text(enrichClass, MARGIN + 340, curY + 7);
                doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
                   .text(elemStr, MARGIN + 440, curY + 7);
                curY += 22;
            });
            
            curY += 6;
            doc.fillColor(C_GRAY).font('Helvetica-Oblique').fontSize(7.5)
               .text('Note: Concentrations are estimated from the NGCM geochemical database (spatial KNN) and geochemical enrichment thresholds (70th percentile). Values represent estimated % composition relative to sediment background levels.', MARGIN, curY, { width: CONTENT_W, lineGap: 2 });
            curY += 24;
            
        } else {
            drawBox(MARGIN, curY, CONTENT_W, 36, C_LIGHT_BG);
            doc.fillColor(C_GRAY).font('Helvetica-Oblique').fontSize(9)
               .text('No significant mineral concentrations detected above the 70th percentile enrichment threshold at this location.', MARGIN + 12, curY + 12, { width: CONTENT_W - 24 });
            curY += 52;
        }
        
        drawHRule(curY, '#e2e8f0');
        curY += 16;
        
        // ═══════════════════════════════════════════
        // SECTION 4: GEOCHEMICAL INPUT PARAMETERS
        // ═══════════════════════════════════════════
        curY = sectionHeader('4. Input Geochemical Parameters', curY);
        
        drawBox(MARGIN, curY, CONTENT_W, 60, C_CARD_BG);
        
        const geoParams = [
            ['Iron Oxide (Fe₂O₃)', `${record.fe} %`, MARGIN + 12, curY + 14],
            ['Copper (Cu)', `${record.cu} ppm`, MARGIN + 12, curY + 34],
            ['Zinc (Zn)', `${record.zn} ppm`, MARGIN + 175, curY + 14],
        ];
        
        geoParams.forEach(([label, val, x, y]) => {
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text(label, x, y);
            doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(10).text(val, x + 140, y);
        });
        
        curY += 76;
        
        // ═══════════════════════════════════════════
        // SECTION 5: XAI MODEL INTERPRETATION
        // ═══════════════════════════════════════════
        curY = sectionHeader('5. Explainable AI (XAI) Model Interpretation', curY);
        
        const scoreDesc = record.mineral_probability > 60
            ? `The HIGH potential score of ${record.mineral_probability}% indicates strongly enriched mineralized geochemical signatures, consistent with known local mining clusters and quarry activity. This region shows element concentrations significantly above background levels.`
            : record.mineral_probability > 20
            ? `The MODERATE potential score of ${record.mineral_probability}% indicates measurable geochemical anomalies above background crustal levels. Element enrichment is present but sub-economic. Further detailed prospecting is recommended.`
            : `The LOW potential score of ${record.mineral_probability}% indicates geochemical values within normal crustal background ranges. The region shows minimal enrichment signals relative to the NGCM database baseline.`;
        
        const geoDesc = `Rock Type: The selected '${record.rock_type}' lithology matches geological units within the '${record.geological_zone || 'identified formation'}', which are known hosts for associated mineral assemblages in the Dharwar Craton of southern India.`;
        
        const chemDesc = `Geochemistry: Input concentrations (Fe₂O₃: ${record.fe}%, Cu: ${record.cu} ppm, Zn: ${record.zn} ppm) were cross-correlated against 10,004 stream sediment samples from the National Geochemical Campaign Mapping (NGCM) database. The nearest known mineral occurrence ('${record.nearest_mineral}') is located ${(record.nearest_mineral_dist_km || 0).toFixed(2)} km from the prediction target, influencing the spatial proximity score component.`;
        
        const methodDesc = `Methodology: Predictions are generated by a trained Random Forest Regressor (scikit-learn) using features: latitude, longitude, Fe₂O₃, Cu_ppm, Zn_ppm, Au_ppb, MnO, Ni_ppm, Cr_ppm, Pb_ppm, geological_unit, and rock_type. The model was trained on joined NGCM + GSI lithology spatial data with KNN proximity weighting.`;
        
        doc.fillColor(C_DARK).font('Helvetica').fontSize(9).lineGap(3)
           .text(scoreDesc, MARGIN, curY, { width: CONTENT_W, align: 'justify' });
        curY = doc.y + 8;
        
        doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(8).text('Rock Type Assessment:', MARGIN, curY);
        curY = doc.y + 2;
        doc.fillColor(C_DARK).font('Helvetica').fontSize(8.5).lineGap(2)
           .text(geoDesc, MARGIN + 12, curY, { width: CONTENT_W - 12, align: 'justify' });
        curY = doc.y + 8;
        
        doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(8).text('Geochemical Analysis:', MARGIN, curY);
        curY = doc.y + 2;
        doc.fillColor(C_DARK).font('Helvetica').fontSize(8.5).lineGap(2)
           .text(chemDesc, MARGIN + 12, curY, { width: CONTENT_W - 12, align: 'justify' });
        curY = doc.y + 8;
        
        doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(8).text('Methodology:', MARGIN, curY);
        curY = doc.y + 2;
        doc.fillColor(C_DARK).font('Helvetica').fontSize(8.5).lineGap(2)
           .text(methodDesc, MARGIN + 12, curY, { width: CONTENT_W - 12, align: 'justify' });
        curY = doc.y + 18;
        
        // ═══════════════════════════════════════════
        // SECTION 6: CORE PLATFORM CAPABILITIES
        // ═══════════════════════════════════════════
        drawHRule(curY, '#e2e8f0');
        curY += 16;
        curY = sectionHeader('6. GeoMiner AI — Core Platform Capabilities', curY);
        
        const caps = [
            ['Spatial Area Selection', 'Interactive GIS map with click-to-point and rectangle area draw. 5 km exploration boundary auto-plotted from centroid coordinates.'],
            ['Predictive ML Models', 'Random Forest regressors on NGCM (10,004 records, 68 elements). Mineral probability + element-wise percentage concentrations output.'],
            ['Prospectivity Heatmaps', 'Real-time density heatmaps overlaid on Leaflet.js maps showing high-potential exploration zones from known mineral occurrence registry.'],
            ['PDF Exploration Reports', 'Auto-generated reports covering: mineral inventory, concentrations (%), lat/lon/altitude, geological zone, nearest deposits, XAI model interpretation.'],
        ];
        
        caps.forEach(([title, desc], idx) => {
            const cx = idx % 2 === 0 ? MARGIN : MARGIN + CONTENT_W / 2 + 6;
            const cy = curY + Math.floor(idx / 2) * 52;
            drawBox(cx, cy, CONTENT_W / 2 - 6, 46, C_LIGHT_BG);
            doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(8.5).text(`• ${title}`, cx + 10, cy + 8);
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(7.5).lineGap(1.5)
               .text(desc, cx + 10, cy + 22, { width: CONTENT_W / 2 - 26 });
        });
        
        curY += 110;
        
        // ═══════════════════════════════════════════
        // FOOTER
        // ═══════════════════════════════════════════
        const footerY = doc.page.height - 55;
        doc.rect(0, footerY - 5, PAGE_W, 60).fillColor(C_DARK).fill();
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
           .text(
            'DISCLAIMER: This report is generated by GeoMiner AI using mathematical predictive models trained on publicly available geological databases (NGCM, GSI). Mineral prospectivity scores are probabilistic estimates and do not constitute a guarantee of economic mineral deposits. All exploration activities should be verified through certified geological field surveys before investment decisions.',
            MARGIN, footerY + 4, { align: 'center', width: CONTENT_W, lineGap: 2 }
           );
        doc.fillColor(C_BLUE_LIGHT).font('Helvetica-Bold').fontSize(8)
           .text('GeoMiner AI  |  ML Exploration Platform  |  v1.0.0', MARGIN, footerY + 32, { align: 'center', width: CONTENT_W });
        
        // Finalize PDF
        doc.end();
        
    } catch (err) {
        console.error('Failed to generate PDF Report:', err);
        return res.status(500).json({ error: 'Failed to generate PDF report.' });
    }
};

// 5. Fetch known occurrences from CSV database
exports.getOccurrences = async (req, res) => {
    try {
        const fs = require('fs');
        const csvPath = path.join(__dirname, '..', '..', 'data', 'mineral_occurrence.csv');
        if (!fs.existsSync(csvPath)) {
            return res.status(404).json({ error: 'Occurrences file not found.' });
        }
        
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.trim().split('\n');
        const list = [];
        
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length >= 4) {
                list.push({
                    x: parseFloat(values[0]),
                    y: parseFloat(values[1]),
                    commodity: values[2].replace(/"/g, '').trim(),
                    type: values[3].replace(/"/g, '').trim()
                });
            }
        }
        return res.status(200).json(list);
    } catch (err) {
        console.error('Failed to fetch mineral occurrences:', err);
        return res.status(500).json({ error: 'Failed to read occurrences database.' });
    }
};

// 6. Proxy Geocoding requests to bypass CORS block
exports.geocodeLocation = async (req, res) => {
    try {
        const { q, key } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter q is required.' });
        }
        
        // Google Maps Geocoding if key is provided
        if (key && key.trim() && key.trim() !== 'null' && key.trim() !== 'undefined') {
            try {
                const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`;
                const response = await fetch(url);
                const data = await response.json();
                if (data.status === 'OK') {
                    const loc = data.results[0].geometry.location;
                    return res.status(200).json({
                        success: true,
                        latitude: loc.lat,
                        longitude: loc.lng,
                        address: data.results[0].formatted_address
                    });
                }
            } catch (gErr) {
                console.error('Google Maps geocoding failed, falling back to OSM:', gErr);
            }
        }
        
        // OpenStreetMap Nominatim Geocoding fallback
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'GeoMiner-AI-Platform/1.0' }
        });
        const data = await response.json();
        
        if (data && data.length > 0) {
            return res.status(200).json({
                success: true,
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon),
                address: data[0].display_name
            });
        }
        
        return res.status(200).json({ success: false });
    } catch (err) {
        console.error('Geocoding error:', err);
        return res.status(500).json({ error: 'Geocoding request failed.' });
    }
};
