const { execFile } = require('child_process');
const path = require('path');
const PDFDocument = require('pdfkit');
const { dbService } = require('../database/mongodb_connection');

// Constants — Python path resolves from env var, then platform defaults
const PYTHON_PATH = process.env.PYTHON_PATH || (
    process.platform === 'win32'
        ? 'C:\\Python312\\python.exe'           // Windows local dev
        : '/opt/venv/bin/python3'               // Linux (Render / Docker)
);
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
        
        // Spawn Python ML subprocess (120s timeout to prevent indefinite hang)
        execFile(PYTHON_PATH, args, { timeout: 120000, maxBuffer: 1024 * 1024 * 5 }, async (error, stdout, stderr) => {
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
                    rock_type: mlResult.rock_type || cleanRock,
                    altitude: mlResult.altitude !== undefined ? mlResult.altitude : cleanAlt,
                    mineral_probability: mlResult.mineral_probability,
                    predicted_minerals: mlResult.predicted_minerals,
                    documented_minerals: mlResult.documented_minerals || [],
                    mineral_percentages: mlResult.mineral_percentages || {},
                    confidence: mlResult.confidence,
                    geological_zone: mlResult.geological_zone,
                    nearest_mineral: mlResult.nearest_mineral,
                    nearest_mineral_dist_km: mlResult.nearest_mineral_dist_km,
                    occurrence_present: mlResult.occurrence_present || false,
                    belt_name: mlResult.belt_name || '',
                    explanation: mlResult.explanation,
                    lithology: mlResult.lithology || 'Unknown',
                    geological_unit: mlResult.geological_unit || 'Unknown',
                    formation: mlResult.formation || 'Unknown'
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
                    documented_minerals: mlResult.documented_minerals || [],
                    mineral_percentages: mlResult.mineral_percentages || {},
                    confidence: mlResult.confidence,
                    geological_zone: mlResult.geological_zone,
                    nearest_mineral: mlResult.nearest_mineral,
                    nearest_mineral_dist_km: mlResult.nearest_mineral_dist_km,
                    occurrence_present: mlResult.occurrence_present || false,
                    belt_name: mlResult.belt_name || '',
                    rock_type: savedLog.rock_type,
                    lithology: savedLog.lithology,
                    geological_unit: savedLog.geological_unit,
                    formation: savedLog.formation,
                    explanation: savedLog.explanation
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
        const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: true });
        const filename = `geominer-report-${id.substring(0, 8)}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        doc.pipe(res);
        
        // ─── COLOR PALETTE ───
        const C_DARK       = '#0f172a';
        const C_BLUE       = '#0284c7';
        const C_BLUE_LIGHT = '#38bdf8';
        const C_GREEN      = '#10b981';
        const C_AMBER      = '#f59e0b';
        const C_RED        = '#ef4444';
        const C_GRAY       = '#64748b';
        const C_LIGHT_BG   = '#f8fafc';
        const C_CARD_BG    = '#f1f5f9';
        
        const PAGE_W   = doc.page.width;
        const PAGE_H   = doc.page.height;
        const MARGIN   = 50;
        const CONTENT_W= PAGE_W - MARGIN * 2;
        const FOOTER_H = 60;   // reserved at bottom for footer
        const SAFE_BTM = PAGE_H - FOOTER_H - MARGIN; // lowest Y we can draw at
        
        let curY = 0;

        // ─── HELPER: ensure enough vertical space, add page if needed ───
        const ensureSpace = (needed) => {
            if (curY + needed > SAFE_BTM) {
                doc.addPage();
                // Continuation mini-header
                doc.rect(0, 0, PAGE_W, 28).fillColor(C_DARK).fill();
                doc.fillColor(C_BLUE_LIGHT).font('Helvetica-Bold').fontSize(9)
                   .text('GEOMINER AI  — Report Continued', MARGIN, 9);
                curY = 42;
            }
        };

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

        // ─── FOOTER HELPER (called at doc.end) ───
        const drawFooter = () => {
            const footerY = PAGE_H - 55;
            doc.rect(0, footerY - 5, PAGE_W, 60).fillColor(C_DARK).fill();
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
               .text(
                'DISCLAIMER: This report is generated by GeoMiner AI using mathematical predictive models trained on publicly available geological databases (NGCM, GSI). Mineral prospectivity scores are probabilistic estimates and do not constitute a guarantee of economic mineral deposits. All exploration activities should be verified through certified geological field surveys before investment decisions.',
                MARGIN, footerY + 4, { align: 'center', width: CONTENT_W, lineGap: 2 }
               );
            doc.fillColor(C_BLUE_LIGHT).font('Helvetica-Bold').fontSize(8)
               .text('GeoMiner AI  |  ML Exploration Platform  |  v2.0', MARGIN, footerY + 32, { align: 'center', width: CONTENT_W });
        };
        
        // ═══════════════════════════════════════════
        // HEADER BANNER  (Page 1)
        // ═══════════════════════════════════════════
        doc.rect(0, 0, PAGE_W, 100).fillColor(C_DARK).fill();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24)
           .text('GEOMINER AI', MARGIN, 28);
        doc.fillColor(C_BLUE_LIGHT).font('Helvetica').fontSize(9)
           .text('MINERAL INTELLIGENCE & GEOLOGICAL DISCOVERY PLATFORM', MARGIN, 56);
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
           .text(`Report ID: ${id}`, MARGIN, 28, { align: 'right', width: CONTENT_W })
           .text(`Generated: ${new Date(record.createdAt || Date.now()).toLocaleString('en-IN')}`, MARGIN, 40, { align: 'right', width: CONTENT_W })
           .text(`Coordinates: ${record.latitude.toFixed(5)}°N, ${record.longitude.toFixed(5)}°E`, MARGIN, 52, { align: 'right', width: CONTENT_W })
           .text(`Altitude: ${(record.altitude || 450.0).toFixed(1)} m (AMSL)`, MARGIN, 64, { align: 'right', width: CONTENT_W });
        
        curY = 118;
        
        // ═══════════════════════════════════════════
        // SECTION 1: EXECUTIVE SUMMARY
        // ═══════════════════════════════════════════
        ensureSpace(120);
        curY = sectionHeader('1. Executive Summary', curY);
        
        const confColor = record.confidence === 'High' ? C_RED : (record.confidence === 'Medium' ? C_AMBER : C_GREEN);

        drawBox(MARGIN, curY, 155, 80, C_CARD_BG);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text('MINERAL POTENTIAL SCORE', MARGIN + 10, curY + 10);
        doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(32)
           .text(`${record.mineral_probability}%`, MARGIN + 10, curY + 24);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
           .text('AI computed probability vs. known deposits', MARGIN + 10, curY + 62, { width: 130 });
        
        drawBox(MARGIN + 165, curY, 150, 80, C_CARD_BG);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text('CONFIDENCE RATING', MARGIN + 175, curY + 10);
        doc.fillColor(confColor).font('Helvetica-Bold').fontSize(26)
           .text(record.confidence || 'Medium', MARGIN + 175, curY + 28);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
           .text('Exploration risk classification index', MARGIN + 175, curY + 62, { width: 130 });
        
        // Documented minerals box (replaces nearest_mineral box)
        const docMins = record.documented_minerals || [];
        const beltName= record.belt_name || '';
        drawBox(MARGIN + 325, curY, 185, 80, C_CARD_BG);
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text('DOCUMENTED OCCURRENCES', MARGIN + 335, curY + 10);
        if (docMins.length > 0) {
            doc.fillColor(C_GREEN).font('Helvetica-Bold').fontSize(10)
               .text(docMins.slice(0, 3).join(', '), MARGIN + 335, curY + 28, { width: 160 });
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
               .text(beltName ? `📍 ${beltName}` : 'GSI registry verified', MARGIN + 335, curY + 52, { width: 160 });
        } else {
            doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(10)
               .text('None documented', MARGIN + 335, curY + 28, { width: 160 });
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
               .text('No local occurrence in registry', MARGIN + 335, curY + 52);
        }
        
        curY += 98;
        drawHRule(curY, '#e2e8f0');
        curY += 16;
        
        // ═══════════════════════════════════════════
        // SECTION 2: SPATIAL & GEOLOGICAL DETAILS
        // ═══════════════════════════════════════════
        ensureSpace(130);
        curY = sectionHeader('2. Spatial & Geological Information', curY);
        
        drawBox(MARGIN, curY, CONTENT_W, 110, C_LIGHT_BG);
        
        const col1X = MARGIN + 12;
        const col2X = MARGIN + 180;
        const col3X = MARGIN + 360;
        
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7.5)
           .text('LATITUDE',       col1X, curY + 12)
           .text('LONGITUDE',      col1X, curY + 42)
           .text('ALTITUDE (AMSL)',col1X, curY + 72);
        doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(10)
           .text(`${record.latitude.toFixed(5)}°N`,       col1X + 90, curY + 11)
           .text(`${record.longitude.toFixed(5)}°E`,      col1X + 90, curY + 41)
           .text(`${(record.altitude || 450.0).toFixed(1)} m`, col1X + 90, curY + 71);
           
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7.5)
           .text('ROCK TYPE:',       col2X, curY + 12)
           .text('LITHOLOGY:',       col2X, curY + 32)
           .text('GEOLOGICAL UNIT:', col2X, curY + 52)
           .text('FORMATION:',       col2X, curY + 72)
           .text('BELT / ZONE:',     col2X, curY + 92);
        doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(8.5)
           .text(record.rock_type      || 'Granite',          col2X + 95, curY + 12, { width: 150 })
           .text(record.lithology      || 'Granitic Gneiss',  col2X + 95, curY + 32, { width: 150 })
           .text(record.geological_unit|| 'Dharwar Craton',   col2X + 95, curY + 52, { width: 150 })
           .text(record.formation      || 'Unknown Formation', col2X + 95, curY + 72, { width: 150 })
           .text(beltName              || 'General Survey Area', col2X + 95, curY + 92, { width: 150 });
           
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7.5)
           .text('DOCUMENTED MINERALS', col3X, curY + 12);
        if (docMins.length > 0) {
            docMins.slice(0, 5).forEach((m, i) => {
                doc.fillColor(C_GREEN).font('Helvetica-Bold').fontSize(8.5)
                   .text(`• ${m}`, col3X, curY + 26 + i * 16, { width: 130 });
            });
        } else {
            doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(8.5)
               .text('None (No local record)', col3X, curY + 24, { width: 130 });
        }
        
        curY += 126;
        drawHRule(curY, '#e2e8f0');
        curY += 16;
        
        // ═══════════════════════════════════════════
        // SECTION 3: MINERAL INVENTORY
        // ═══════════════════════════════════════════
        ensureSpace(50);
        curY = sectionHeader('3. Detected Mineral Inventory with Estimated Concentrations', curY);
        
        const minerals = record.predicted_minerals || [];
        const pctMap   = record.mineral_percentages || {};
        
        const MINERAL_ELEMENTS = {
            'Iron':      'Fe₂O₃ oxide',  'Copper':    'Cu (ppm)',
            'Zinc':      'Zn (ppm)',      'Gold':      'Au (ppb)',
            'Manganese': 'MnO oxide',     'Nickel':    'Ni (ppm)',
            'Lead':      'Pb (ppm)',      'Chromium':  'Cr (ppm)',
            'Vanadium':  'V (ppm)',       'Cobalt':    'Co (ppm)',
            'Titanium':  'TiO₂ oxide',   'Molybdenum':'Mo (ppm)',
            'Tin':       'Sn (ppm)',      'Tungsten':  'W (ppm)',
            'Silver':    'Ag (ppm)',      'Arsenic':   'As (ppm)',
            'Bismuth':   'Bi (ppm)',      'Antimony':  'Sb (ppm)',
            'Barite':    'Ba (ppm)',      'Uranium':   'U (ppm)',
            'Thorium':   'Th (ppm)',      'Niobium':   'Nb (ppm)',
            'Zirconium': 'Zr (ppm)',      'Diamond':   'C (gem)',
            'Quartzite': 'SiO₂ silica',  'Clay':      'Al₂O₃ oxide'
        };
        
        if (minerals.length > 0) {
            // Table header — ensure it fits
            ensureSpace(30);
            drawBox(MARGIN, curY, CONTENT_W, 22, C_DARK);
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
               .text('Mineral Name',           MARGIN + 12,  curY + 7)
               .text('Est. Concentration (%)', MARGIN + 195, curY + 7)
               .text('Enrichment Class',       MARGIN + 330, curY + 7)
               .text('Indicator Elements',     MARGIN + 435, curY + 7);
            curY += 22;
            
            minerals.forEach((min, idx) => {
                // Page break before each row if near bottom
                ensureSpace(24);

                const pct        = pctMap[min] !== undefined ? pctMap[min] : 1.5;
                const pctStr     = formatPct(pct);
                const rowBg      = idx % 2 === 0 ? '#ffffff' : C_LIGHT_BG;
                const enrichClass= pct > 5 ? 'HIGH' : (pct > 1 ? 'MODERATE' : 'TRACE');
                const enrichColor= pct > 5 ? C_RED : (pct > 1 ? C_AMBER : C_GRAY);
                const elemStr    = MINERAL_ELEMENTS[min] || 'Multi-element';
                const isDoc      = docMins.includes(min);
                
                drawBox(MARGIN, curY, CONTENT_W, 22, rowBg, '#e2e8f0');
                // Star for documented minerals
                doc.fillColor(isDoc ? C_GREEN : C_DARK).font('Helvetica-Bold').fontSize(9)
                   .text(`${isDoc ? '★ ' : ''}${min}`, MARGIN + 12, curY + 7);
                doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(9)
                   .text(pctStr, MARGIN + 195, curY + 7);
                doc.fillColor(enrichColor).font('Helvetica-Bold').fontSize(8)
                   .text(enrichClass, MARGIN + 330, curY + 7);
                doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
                   .text(elemStr, MARGIN + 435, curY + 7);
                curY += 22;
            });
            
            ensureSpace(30);
            curY += 6;
            doc.fillColor(C_GRAY).font('Helvetica-Oblique').fontSize(7.5)
               .text('★ = Documented GSI mineral occurrence  |  Note: Concentrations are estimated from the NGCM geochemical database (spatial KNN). Values represent estimated % composition relative to sediment background levels.', MARGIN, curY, { width: CONTENT_W, lineGap: 2 });
            curY += 24;
        } else {
            ensureSpace(50);
            drawBox(MARGIN, curY, CONTENT_W, 36, C_LIGHT_BG);
            doc.fillColor(C_GRAY).font('Helvetica-Oblique').fontSize(9)
               .text('No significant mineral concentrations detected at this location.', MARGIN + 12, curY + 12, { width: CONTENT_W - 24 });
            curY += 52;
        }
        
        ensureSpace(20);
        drawHRule(curY, '#e2e8f0');
        curY += 16;
        
        // ═══════════════════════════════════════════
        // SECTION 4: GEOCHEMICAL INPUT PARAMETERS
        // ═══════════════════════════════════════════
        ensureSpace(90);
        curY = sectionHeader('4. Input Geochemical Parameters', curY);
        
        drawBox(MARGIN, curY, CONTENT_W, 60, C_CARD_BG);
        const geoParams = [
            ['Iron Oxide (Fe₂O₃)', `${record.fe} %`,  MARGIN + 12,  curY + 14],
            ['Copper (Cu)',         `${record.cu} ppm`,MARGIN + 12,  curY + 34],
            ['Zinc (Zn)',           `${record.zn} ppm`,MARGIN + 200, curY + 14],
        ];
        geoParams.forEach(([label, val, x, y]) => {
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text(label, x, y);
            doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(10).text(val, x + 140, y);
        });
        curY += 76;
        
        // ═══════════════════════════════════════════
        // SECTION 5: XAI MODEL INTERPRETATION
        // ═══════════════════════════════════════════
        ensureSpace(50);
        curY = sectionHeader('5. Explainable AI (XAI) Model Interpretation', curY);
        
        const scoreDesc = record.mineral_probability > 60
            ? `The HIGH potential score of ${record.mineral_probability}% indicates strongly enriched mineralized geochemical signatures, consistent with known local mining clusters and quarry activity.`
            : record.mineral_probability > 20
            ? `The MODERATE potential score of ${record.mineral_probability}% indicates measurable geochemical anomalies above background crustal levels. Further detailed prospecting is recommended.`
            : `The LOW potential score of ${record.mineral_probability}% indicates geochemical values within normal crustal background ranges relative to the NGCM database baseline.`;
        
        const explanationText = record.explanation || 
            `The selected coordinate lies within the ${record.geological_unit || 'study area'}. NGCM geochemical data was used to estimate mineral concentrations.`;
        
        const methodDesc = `Methodology: Predictions use a trained Random Forest Regressor on NGCM (10,004 samples, 68 elements). Features: lat/lon, Fe₂O₃, Cu_ppm, Zn_ppm, Au_ppb, MnO, Ni_ppm, Cr_ppm, Pb_ppm, geological_unit, rock_type. Two-stage: documented occurrence lookup (25 km radius) + ML geochemistry inference.`;

        ensureSpace(50);
        doc.fillColor(C_DARK).font('Helvetica').fontSize(9).lineGap(3)
           .text(scoreDesc, MARGIN, curY, { width: CONTENT_W, align: 'justify' });
        curY = doc.y + 8;
        
        ensureSpace(60);
        doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(8).text('AI Explanation:', MARGIN, curY);
        curY = doc.y + 2;
        doc.fillColor(C_DARK).font('Helvetica').fontSize(8.5).lineGap(2)
           .text(explanationText, MARGIN + 12, curY, { width: CONTENT_W - 12, align: 'justify' });
        curY = doc.y + 8;
        
        ensureSpace(50);
        doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(8).text('Methodology:', MARGIN, curY);
        curY = doc.y + 2;
        doc.fillColor(C_DARK).font('Helvetica').fontSize(8.5).lineGap(2)
           .text(methodDesc, MARGIN + 12, curY, { width: CONTENT_W - 12, align: 'justify' });
        curY = doc.y + 18;
        
        // ═══════════════════════════════════════════
        // SECTION 6: CORE PLATFORM CAPABILITIES
        // ═══════════════════════════════════════════
        ensureSpace(130);
        drawHRule(curY, '#e2e8f0');
        curY += 16;
        curY = sectionHeader('6. GeoMiner AI — Core Platform Capabilities', curY);
        
        const caps = [
            ['Spatial Area Selection', 'Interactive GIS map with click-to-point selection. 5 km exploration boundary auto-plotted from target coordinates.'],
            ['Hybrid Prediction Engine', 'Two-stage: documented occurrence lookup (25 km buffer) + Random Forest ML on NGCM (10,004 records, 68 elements).'],
            ['Geological Belt Recognition', 'Automatically detects Kolar Gold Field, Bellary Iron Belt, Sandur Schist Belt, Chitradurga Belt, and Kurnool Diamond Zone.'],
            ['PDF Exploration Reports', 'Auto-generated reports: mineral inventory, concentrations, lat/lon/altitude, geological zone, documented occurrences, XAI.'],
        ];
        
        ensureSpace(110);
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
        // FOOTER (drawn on the last page)
        // ═══════════════════════════════════════════
        drawFooter();
        
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
                if (!response.ok) throw new Error(`Google Maps API returned ${response.status}`);
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
        // OpenStreetMap Nominatim fallback
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
        const response = await fetch(url, { headers: { 'User-Agent': 'GeoMiner-AI-Platform/1.0' } });
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

// 7. Developer Diagnostic — full pipeline audit for a coordinate
exports.diagnosePrediction = async (req, res) => {
    try {
        const fs  = require('fs');
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon);
        if (isNaN(lat) || isNaN(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters are required.' });
        }
        const dataDir  = path.join(__dirname, '..', '..', 'data');
        const ngcmPath = path.join(dataDir, 'ngcm.csv');
        const occPath  = path.join(dataDir, 'mineral_occurrence.csv');

        const readCsv = (p) => {
            const lines   = fs.readFileSync(p, 'utf8').trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            return lines.slice(1).map(l => {
                const vals = l.split(',');
                const obj  = {};
                headers.forEach((h, i) => obj[h] = vals[i]?.trim().replace(/"/g, ''));
                return obj;
            });
        };

        const ngcm = readCsv(ngcmPath);
        const occ  = readCsv(occPath);

        // KNN to nearest NGCM
        let minDist = Infinity, nearestNgcm = null;
        ngcm.forEach(row => {
            const d = Math.sqrt((parseFloat(row.latitude) - lat) ** 2 + (parseFloat(row.longitude) - lon) ** 2);
            if (d < minDist) { minDist = d; nearestNgcm = row; }
        });

        // Occurrence search (25 km)
        const nearOcc = occ.filter(r => {
            const d = Math.sqrt((parseFloat(r.y) - lat) ** 2 + (parseFloat(r.x) - lon) ** 2) * 111.0;
            return d <= 25.0;
        });

        // Known belts
        const BELTS = [
            { name: 'Kolar Gold Field',     lat_min: 12.8, lat_max: 13.3, lon_min: 77.9, lon_max: 78.4, minerals: ['Gold', 'Silver', 'Copper'] },
            { name: 'Bellary Iron Belt',    lat_min: 14.8, lat_max: 15.5, lon_min: 76.1, lon_max: 76.6, minerals: ['Iron', 'Manganese', 'Chromium'] },
            { name: 'Sandur Schist Belt',   lat_min: 14.9, lat_max: 15.3, lon_min: 76.3, lon_max: 76.7, minerals: ['Iron', 'Chromium', 'Vanadium'] },
            { name: 'Chitradurga Belt',     lat_min: 13.9, lat_max: 14.4, lon_min: 76.2, lon_max: 76.8, minerals: ['Iron', 'Copper', 'Gold'] },
            { name: 'Kurnool Diamond Zone', lat_min: 15.0, lat_max: 15.6, lon_min: 77.4, lon_max: 77.9, minerals: ['Diamond', 'Gold'] },
            { name: 'Eastern Ghats Belt',   lat_min: 14.5, lat_max: 16.0, lon_min: 79.0, lon_max: 80.5, minerals: ['Niobium', 'Zirconium', 'Thorium'] },
        ];
        const matchedBelt = BELTS.find(b => lat >= b.lat_min && lat <= b.lat_max && lon >= b.lon_min && lon <= b.lon_max) || null;

        return res.status(200).json({
            input: { latitude: lat, longitude: lon },
            bounds_check: {
                nearest_ngcm_dist_deg: minDist.toFixed(6),
                nearest_ngcm_dist_km:  (minDist * 111).toFixed(2),
                in_bounds:             minDist <= 0.5,
                belt_bypasses_bounds:  !!matchedBelt
            },
            nearest_ngcm_sample: {
                latitude:        nearestNgcm?.latitude,
                longitude:       nearestNgcm?.longitude,
                district:        nearestNgcm?.district,
                state:           nearestNgcm?.state,
                geological_unit: nearestNgcm?.geological_unit,
                fe2o3:           nearestNgcm?.fe2o3__,
                au_ppb:          nearestNgcm?.au_ppb,
            },
            occurrence_search: {
                radius_km: 25,
                found:     nearOcc.length,
                occurrences: nearOcc.map(o => ({
                    commodity: o.commodity,
                    dist_km:   (Math.sqrt((parseFloat(o.y) - lat) ** 2 + (parseFloat(o.x) - lon) ** 2) * 111).toFixed(2)
                }))
            },
            belt_match: matchedBelt ? { name: matchedBelt.name, minerals: matchedBelt.minerals } : null,
            recommendation: nearOcc.length > 0 || matchedBelt
                ? 'HIGH POTENTIAL — documented occurrence or belt match found'
                : minDist <= 0.5
                ? 'PREDICTABLE — within NGCM coverage, ML inference will run'
                : 'OUT OF BOUNDS — no data for this coordinate'
        });
    } catch (err) {
        console.error('Diagnose error:', err);
        return res.status(500).json({ error: 'Diagnostic failed: ' + err.message });
    }
};

