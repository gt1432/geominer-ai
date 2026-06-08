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
        
        // Setup PDF Document
        const doc = new PDFDocument({ margin: 50 });
        const filename = `geominer-report-${id.substring(0, 8)}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        
        // Pipe the PDF document to response stream
        doc.pipe(res);
        
        // --- PDF STYLING & DRAWING ---
        
        // Colors
        const brandBlue = '#0f172a'; // Slate / Dark Blue
        const highlightBlue = '#0284c7'; // Teal blue
        const textMuted = '#4b5563';
        
        // Header Logo / Brand Title
        doc.fillColor(brandBlue)
           .font('Helvetica-Bold')
           .fontSize(22)
           .text('GEOMINER AI', 50, 45)
           .fontSize(10)
           .fillColor(highlightBlue)
           .text('GEOLOGICAL INTELLIGENCE & DISCOVERY PLATFORM', 50, 68);
           
        // Draw Double Border Horizontal lines
        doc.strokeColor(brandBlue).lineWidth(2).moveTo(50, 85).lineTo(560, 85).stroke();
        doc.strokeColor(highlightBlue).lineWidth(0.5).moveTo(50, 90).lineTo(560, 90).stroke();
        
        // Document Subtitle / Metadata
        doc.fillColor(textMuted)
           .font('Helvetica-Oblique')
           .fontSize(8)
           .text(`Report ID: ${id}`, 350, 48, { align: 'right' })
           .text(`Generated: ${new Date(record.createdAt || Date.now()).toLocaleString()}`, 350, 60, { align: 'right' });
           
        // Section 1: Executive Summary Card
        doc.fillColor(brandBlue)
           .font('Helvetica-Bold')
           .fontSize(14)
           .text('1. Executive Exploration Summary', 50, 110);
           
        // Draw a light grey bounding card box
        doc.rect(50, 130, 510, 80)
           .fillColor('#f3f4f6')
           .fill();
           
        doc.fillColor(brandBlue)
           .font('Helvetica-Bold')
           .fontSize(10)
           .text('Mineral Potential Score:', 70, 145)
           .fontSize(22)
           .fillColor(highlightBlue)
           .text(`${record.mineral_probability}%`, 70, 160)
           .fontSize(9)
           .fillColor(textMuted)
           .text('Computed Exploration Probability', 70, 190);
           
        doc.fillColor(brandBlue)
           .font('Helvetica-Bold')
           .fontSize(10)
           .text('Confidence Classification:', 300, 145)
           .fontSize(16)
           .fillColor(record.confidence === 'High' ? '#10b981' : '#f59e0b')
           .text(record.confidence, 300, 162)
           .fontSize(9)
           .fillColor(textMuted)
           .text('Target exploration risk index', 300, 185);
           
        // Section 2: Spatial Details
        doc.fillColor(brandBlue)
           .font('Helvetica-Bold')
           .fontSize(14)
           .text('2. Spatial & Geographic Information', 50, 230);
           
        // Coordinates and Location info
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(brandBlue)
           .text('Latitude:', 55, 250, { width: 100 })
           .font('Helvetica-Bold')
           .text(record.latitude.toFixed(5), 150, 250)
           .font('Helvetica')
           .text('Longitude:', 55, 268, { width: 100 })
           .font('Helvetica-Bold')
           .text(record.longitude.toFixed(5), 150, 268)
           .font('Helvetica')
           .text('Altitude:', 55, 286, { width: 100 })
           .font('Helvetica-Bold')
           .text(`${(record.altitude || 450.0).toFixed(1)} m (AMSL)`, 150, 286)
           .font('Helvetica')
           .text('Geological Zone:', 55, 304, { width: 100 })
           .font('Helvetica-Bold')
           .text(record.geological_zone || 'Vanivilas formation', 150, 304);
           
        doc.font('Helvetica')
           .text('Selected Rock Type:', 300, 250, { width: 150 })
           .font('Helvetica-Bold')
           .text(record.rock_type, 440, 250)
           .font('Helvetica')
           .text('Nearest Known Target:', 300, 268, { width: 150 })
           .font('Helvetica-Bold')
           .text(record.nearest_mineral || 'Quartzite Quarry', 440, 268)
           .font('Helvetica')
           .text('Nearest Dist (km):', 300, 286, { width: 150 })
           .font('Helvetica-Bold')
           .text(`${(record.nearest_mineral_dist_km || 0).toFixed(2)} km`, 440, 286);
           
        doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(50, 325).lineTo(560, 325).stroke();
        
        // Section 3: Geochemical Indicators
        doc.fillColor(brandBlue)
           .font('Helvetica-Bold')
           .fontSize(14)
           .text('3. Input Geochemical Elements Override', 50, 340);
           
        doc.font('Helvetica')
           .fontSize(10)
           .text('Iron oxide concentration (Fe):', 55, 365)
           .font('Helvetica-Bold')
           .text(`${record.fe} %`, 250, 365)
           .font('Helvetica')
           .text('Copper concentration (Cu_ppm):', 55, 385)
           .font('Helvetica-Bold')
           .text(`${record.cu} ppm`, 250, 385)
           .font('Helvetica')
           .text('Zinc concentration (Zn_ppm):', 55, 405)
           .font('Helvetica-Bold')
           .text(`${record.zn} ppm`, 250, 405);
           
        // Section 4: Likely Minerals
        doc.fillColor(brandBlue)
           .font('Helvetica-Bold')
           .fontSize(14)
           .text('4. Likely Minerals Inventory', 320, 340);
           
        let yPos = 365;
        const minerals = record.predicted_minerals || [];
        const percentages = record.mineral_percentages || {};
        if (minerals.length > 0) {
            minerals.forEach((min) => {
                const pct = percentages[min] !== undefined ? percentages[min] : 1.5;
                let pctStr = '';
                if (pct < 0.001) {
                    pctStr = `${(pct * 100).toFixed(6)}%`;
                } else if (pct < 1.0) {
                    pctStr = `${pct.toFixed(4)}%`;
                } else {
                    pctStr = `${pct.toFixed(2)}%`;
                }
                
                doc.fillColor(highlightBlue)
                   .text('  [✓]  ', 320, yPos)
                   .fillColor(brandBlue)
                   .font('Helvetica-Bold')
                   .text(`${min} (${pctStr})`, 360, yPos);
                yPos += 20;
            });
        } else {
            doc.font('Helvetica-Oblique').fontSize(9).fillColor(textMuted).text('No significant minerals matched.', 320, 365);
        }
        
        doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(50, 440).lineTo(560, 440).stroke();
        
        // Section 5: ML Explainability Text
        doc.fillColor(brandBlue)
           .font('Helvetica-Bold')
           .fontSize(14)
           .text('5. Explainable AI (XAI) Model Interpretation', 50, 460);
           
        const targetDesc = record.mineral_probability > 60 
            ? `High score of ${record.mineral_probability}% indicates strongly enriched mineralized signatures typical of local mining clusters. `
            : `Moderate to low score of ${record.mineral_probability}% indicates mostly background crustal levels with low anomalous element indications. `;
            
        const geologicalDesc = `The selected rock type '${record.rock_type}' matches matching units in the '${record.geological_zone}' geological formation. `;
        const geoChemDesc = `With input inputs (Fe: ${record.fe}%, Cu: ${record.cu} ppm, Zn: ${record.zn} ppm), the model correlates this geochemistry against the GSI NGCM sediment database and determines known target overlaps (nearest mineralization commodity is '${record.nearest_mineral}' located ${(record.nearest_mineral_dist_km || 0).toFixed(2)} km away).`;
        
        doc.font('Helvetica')
           .fontSize(9.5)
           .fillColor(textMuted)
           .text(targetDesc + geologicalDesc + geoChemDesc, 50, 485, {
               align: 'justify',
               width: 510,
               lineGap: 4
           });
           
        // Footer notice
        doc.strokeColor(brandBlue).lineWidth(1).moveTo(50, 720).lineTo(560, 720).stroke();
        doc.fillColor(textMuted)
           .font('Helvetica')
           .fontSize(8)
           .text('Disclaimer: This report is generated by GeoMiner AI based on mathematical predictive models. Exploration involves risk and should be verified in field.', 50, 730, { align: 'center', width: 510 });
           
        // Finalize PDF file
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
