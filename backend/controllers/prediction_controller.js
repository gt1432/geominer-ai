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
        if (!record) return res.status(404).json({ error: 'Prediction record not found.' });

        // ─── COLORS ────────────────────────────────────────────────────────
        const C_DARK   = '#0f172a', C_BLUE  = '#0284c7', C_LBLUE = '#38bdf8';
        const C_GREEN  = '#10b981', C_AMBER = '#f59e0b', C_RED   = '#ef4444';
        const C_GRAY   = '#64748b', C_LBG   = '#f8fafc', C_CBG   = '#f1f5f9';

        // ─── DOCUMENT ──────────────────────────────────────────────────────
        const doc = new PDFDocument({
            size: 'A4', margin: 0, autoFirstPage: true,
            bufferPages: false   // stream immediately — no blank page buffering
        });
        const MARGIN    = 50;
        const PAGE_W    = doc.page.width;
        const PAGE_H    = doc.page.height;
        const CONTENT_W = PAGE_W - MARGIN * 2;
        const BOTTOM    = PAGE_H - 70;  // safe bottom limit per page

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=geominer-report-${id.substring(0,8)}.pdf`);
        doc.pipe(res);

        // ─── HELPERS ───────────────────────────────────────────────────────
        const box = (x, y, w, h, fill = C_CBG, stroke = '#e2e8f0') => {
            doc.save().roundedRect(x, y, w, h, 5)
               .fillColor(fill).fill()
               .strokeColor(stroke).lineWidth(0.5).stroke().restore();
        };
        const hRule = (y) => {
            doc.save().strokeColor('#e2e8f0').lineWidth(0.8)
               .moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore();
        };
        const sectionLabel = (text, y) => {
            doc.save().rect(MARGIN, y, 3, 16).fillColor(C_BLUE).fill().restore();
            doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(12)
               .text(text, MARGIN + 10, y + 1, { lineBreak: false });
            return y + 26;
        };
        const fmt = (pct) => {
            if (pct == null) return '—';
            if (pct < 0.001) return (pct * 100).toFixed(6) + '%';
            if (pct < 0.01)  return pct.toFixed(5) + '%';
            if (pct < 1)     return pct.toFixed(3) + '%';
            return pct.toFixed(2) + '%';
        };

        // ─── PAGE-BREAK MACHINERY ──────────────────────────────────────────
        // Auto-draw continuation header whenever a new page is added
        // (covers both manual doc.addPage() AND PDFKit's auto page breaks)
        doc.on('pageAdded', () => {
            doc.save()
               .rect(0, 0, PAGE_W, 26).fillColor(C_DARK).fill()
               .restore();
            doc.fillColor(C_LBLUE).font('Helvetica-Bold').fontSize(8)
               .text('GEOMINER AI  —  Mineral Intelligence Report  (continued)', MARGIN, 8);
            doc.y = 40;  // reset cursor on new page
        });

        // Always check before drawing a block — reads live doc.y
        const need = (h) => { if (doc.y + h > BOTTOM) doc.addPage(); };

        // ═══════════════════════════════════════════════════════════════════
        // PAGE 1 HEADER
        // ═══════════════════════════════════════════════════════════════════
        doc.rect(0, 0, PAGE_W, 96).fillColor(C_DARK).fill();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
           .text('GEOMINER AI', MARGIN, 26, { lineBreak: false });
        doc.fillColor(C_LBLUE).font('Helvetica').fontSize(8.5)
           .text('MINERAL INTELLIGENCE & GEOLOGICAL DISCOVERY PLATFORM', MARGIN, 54, { lineBreak: false });
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
           .text(`Report ID: ${id}`, MARGIN, 26, { align: 'right', width: CONTENT_W, lineBreak: false })
           .text(`Generated: ${new Date(record.createdAt || Date.now()).toLocaleString('en-IN')}`, MARGIN, 38, { align: 'right', width: CONTENT_W, lineBreak: false })
           .text(`${record.latitude.toFixed(5)}°N, ${record.longitude.toFixed(5)}°E`, MARGIN, 50, { align: 'right', width: CONTENT_W, lineBreak: false })
           .text(`Altitude: ${(record.altitude || 450).toFixed(1)} m`, MARGIN, 62, { align: 'right', width: CONTENT_W, lineBreak: false });
        doc.y = 112;

        // ═══════════════════════════════════════════════════════════════════
        // SECTION 1 — EXECUTIVE SUMMARY
        // ═══════════════════════════════════════════════════════════════════
        need(110);
        let y = sectionLabel('1. Executive Summary', doc.y);
        const confColor  = record.confidence === 'High' ? C_RED : record.confidence === 'Medium' ? C_AMBER : C_GREEN;
        const docMins    = Array.isArray(record.documented_minerals) ? record.documented_minerals : [];
        const beltName   = record.belt_name || '';

        // Three KPI boxes
        box(MARGIN,       y, 158, 76, C_CBG);
        box(MARGIN + 168, y, 148, 76, C_CBG);
        box(MARGIN + 326, y, 188, 76, C_CBG);

        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7.5)
           .text('MINERAL POTENTIAL', MARGIN + 8, y + 8, { lineBreak: false });
        doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(30)
           .text(`${record.mineral_probability}%`, MARGIN + 8, y + 22, { lineBreak: false });
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7)
           .text('AI probability score', MARGIN + 8, y + 60, { lineBreak: false });

        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7.5)
           .text('CONFIDENCE', MARGIN + 178, y + 8, { lineBreak: false });
        doc.fillColor(confColor).font('Helvetica-Bold').fontSize(24)
           .text(record.confidence || 'Low', MARGIN + 178, y + 26, { lineBreak: false });
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7)
           .text('Risk classification', MARGIN + 178, y + 60, { lineBreak: false });

        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7.5)
           .text('DOCUMENTED OCCURRENCES', MARGIN + 336, y + 8, { lineBreak: false });
        if (docMins.length > 0) {
            doc.fillColor(C_GREEN).font('Helvetica-Bold').fontSize(9)
               .text(docMins.slice(0, 3).join(', '), MARGIN + 336, y + 26, { width: 170, lineBreak: false });
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(7)
               .text(beltName || 'GSI registry', MARGIN + 336, y + 50, { width: 170, lineBreak: false });
        } else {
            doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(9)
               .text('None documented', MARGIN + 336, y + 26, { lineBreak: false });
        }

        doc.y = y + 84;
        hRule(doc.y); doc.y += 14;

        // ═══════════════════════════════════════════════════════════════════
        // SECTION 2 — GEOLOGICAL INFO
        // ═══════════════════════════════════════════════════════════════════
        need(118);
        y = sectionLabel('2. Spatial & Geological Information', doc.y);
        box(MARGIN, y, CONTENT_W, 108, C_LBG);

        const c1 = MARGIN + 10, c2 = MARGIN + 175, c3 = MARGIN + 355;
        // Column 1: coordinates
        [['LATITUDE',  `${record.latitude.toFixed(5)}°N`],
         ['LONGITUDE', `${record.longitude.toFixed(5)}°E`],
         ['ALTITUDE',  `${(record.altitude||450).toFixed(1)} m`]
        ].forEach(([lbl, val], i) => {
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(7).text(lbl, c1, y+10+i*30, {lineBreak:false});
            doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(9).text(val, c1+80, y+10+i*30, {lineBreak:false});
        });
        // Column 2: geology
        [['ROCK TYPE',  record.rock_type||'Granite'],
         ['LITHOLOGY',  record.lithology||'—'],
         ['GEO UNIT',   (record.geological_unit||'—').substring(0,22)],
         ['BELT / ZONE',beltName||'General Survey']
        ].forEach(([lbl, val], i) => {
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(7).text(lbl, c2, y+10+i*24, {lineBreak:false});
            doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(8).text(val, c2+72, y+10+i*24, {width:145, lineBreak:false});
        });
        // Column 3: documented minerals
        doc.fillColor(C_GRAY).font('Helvetica').fontSize(7).text('DOCUMENTED MINERALS', c3, y+10, {lineBreak:false});
        if (docMins.length > 0) {
            docMins.slice(0, 5).forEach((m, i) =>
                doc.fillColor(C_GREEN).font('Helvetica-Bold').fontSize(8)
                   .text(`• ${m}`, c3, y+24+i*16, {lineBreak:false})
            );
        } else {
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text('None recorded', c3, y+24, {lineBreak:false});
        }

        doc.y = y + 116;
        hRule(doc.y); doc.y += 14;

        // ═══════════════════════════════════════════════════════════════════
        // SECTION 3 — MINERAL TABLE  (most likely to span pages)
        // ═══════════════════════════════════════════════════════════════════
        need(46);
        y = sectionLabel('3. Mineral Inventory — Estimated Concentrations', doc.y);

        const minerals = record.predicted_minerals || [];
        const pctMap   = record.mineral_percentages || {};
        const ELEMS = {
            Iron:'Fe₂O₃',Copper:'Cu ppm',Zinc:'Zn ppm',Gold:'Au ppb',
            Manganese:'MnO',Nickel:'Ni ppm',Lead:'Pb ppm',Chromium:'Cr ppm',
            Vanadium:'V ppm',Cobalt:'Co ppm',Titanium:'TiO₂',Molybdenum:'Mo ppm',
            Tin:'Sn ppm',Tungsten:'W ppm',Silver:'Ag ppm',Arsenic:'As ppm',
            Bismuth:'Bi ppm',Antimony:'Sb ppm',Barite:'Ba ppm',Uranium:'U ppm',
            Thorium:'Th ppm',Niobium:'Nb ppm',Zirconium:'Zr ppm',Diamond:'C gem',
            Quartzite:'SiO₂',Clay:'Al₂O₃'
        };
        const ROW_H = 18;

        if (minerals.length > 0) {
            // Table header — with page check
            need(ROW_H + 4);
            const drawTableHeader = () => {
                box(MARGIN, doc.y, CONTENT_W, ROW_H, C_DARK);
                doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
                   .text('Mineral',        MARGIN + 10, doc.y + 5, {lineBreak:false})
                   .text('Concentration',  MARGIN + 190,doc.y + 5, {lineBreak:false})
                   .text('Class',          MARGIN + 315,doc.y + 5, {lineBreak:false})
                   .text('Indicator',      MARGIN + 415,doc.y + 5, {lineBreak:false});
                doc.y += ROW_H;
            };
            drawTableHeader();

            minerals.forEach((min, idx) => {
                // Redraw header on new pages
                if (doc.y + ROW_H > BOTTOM) {
                    doc.addPage();
                    drawTableHeader();
                }
                const pct  = pctMap[min] ?? 1.5;
                const bg   = idx % 2 === 0 ? '#ffffff' : C_LBG;
                const cls  = pct > 5 ? 'HIGH' : pct > 1 ? 'MOD' : 'TRACE';
                const clr  = pct > 5 ? C_RED  : pct > 1 ? C_AMBER : C_GRAY;
                const isD  = docMins.includes(min);
                const rowY = doc.y;
                box(MARGIN, rowY, CONTENT_W, ROW_H, bg, '#e2e8f0');
                doc.fillColor(isD ? C_GREEN : C_DARK).font('Helvetica-Bold').fontSize(8.5)
                   .text(`${isD ? '★ ' : ''}${min}`, MARGIN + 10, rowY + 5, {lineBreak:false});
                doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(8.5)
                   .text(fmt(pct), MARGIN + 190, rowY + 5, {lineBreak:false});
                doc.fillColor(clr).font('Helvetica-Bold').fontSize(8)
                   .text(cls, MARGIN + 315, rowY + 5, {lineBreak:false});
                doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
                   .text(ELEMS[min] || '—', MARGIN + 415, rowY + 5, {lineBreak:false});
                doc.y = rowY + ROW_H;
            });

            need(20); doc.y += 4;
            doc.fillColor(C_GRAY).font('Helvetica-Oblique').fontSize(7)
               .text('★ = Documented GSI mineral occurrence.  Concentrations from NGCM geochemical database (10,004 stream sediment samples).', MARGIN, doc.y, {width: CONTENT_W});
            doc.y += 4;
        } else {
            need(40);
            box(MARGIN, doc.y, CONTENT_W, 32, C_LBG);
            doc.fillColor(C_GRAY).font('Helvetica-Oblique').fontSize(9)
               .text('No mineral concentrations detected.', MARGIN + 12, doc.y + 10, {width: CONTENT_W - 24});
            doc.y += 40;
        }

        need(14); hRule(doc.y); doc.y += 14;

        // ═══════════════════════════════════════════════════════════════════
        // SECTION 4 — INPUT PARAMETERS
        // ═══════════════════════════════════════════════════════════════════
        need(80);
        y = sectionLabel('4. Input Geochemical Parameters', doc.y);
        box(MARGIN, y, CONTENT_W, 56, C_CBG);
        [['Iron Oxide (Fe₂O₃)', `${record.fe} %`,   c1,  y+10],
         ['Copper (Cu)',          `${record.cu} ppm`, c1,  y+32],
         ['Zinc (Zn)',            `${record.zn} ppm`, c2,  y+10],
        ].forEach(([lbl, val, x, ry]) => {
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text(lbl, x, ry, {lineBreak:false});
            doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(10).text(val, x+130, ry, {lineBreak:false});
        });
        doc.y = y + 64;

        // ═══════════════════════════════════════════════════════════════════
        // SECTION 5 — AI EXPLANATION
        // ═══════════════════════════════════════════════════════════════════
        need(50);
        sectionLabel('5. AI Interpretation & Explanation', doc.y);
        doc.y += 26;

        const scoreDesc = record.mineral_probability > 60
            ? `HIGH potential (${record.mineral_probability}%): strongly enriched geochemical signatures consistent with documented mineral belts and known quarry activity.`
            : record.mineral_probability > 20
            ? `MODERATE potential (${record.mineral_probability}%): measurable geochemical anomalies above crustal background. Further prospecting recommended.`
            : `LOW potential (${record.mineral_probability}%): geochemical values within normal crustal background ranges relative to NGCM baseline.`;

        const explText = record.explanation || `Located within ${record.geological_unit || 'the study area'}. NGCM geochemical data used for mineral concentration estimates.`;
        const methText = `Methodology: Two-stage hybrid engine — (1) documented occurrence lookup within 25 km radius against GSI mineral registry, (2) Random Forest Regressor trained on NGCM (10,004 samples, 68 elements). Known mineral belts (Kolar Gold Field, Bellary Iron Belt, Kurnool Diamond Zone, etc.) are recognized independently of NGCM spatial coverage.`;

        need(40);
        doc.fillColor(C_DARK).font('Helvetica').fontSize(9).lineGap(2.5)
           .text(scoreDesc, MARGIN, doc.y, {width: CONTENT_W, align:'justify'});
        doc.y += 10;

        need(50);
        doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(7.5).text('Geological AI Explanation:', MARGIN, doc.y);
        doc.y = doc.y + 2;
        doc.fillColor(C_DARK).font('Helvetica').fontSize(8.5).lineGap(2)
           .text(explText, MARGIN + 10, doc.y, {width: CONTENT_W - 10, align:'justify'});
        doc.y += 8;

        need(50);
        doc.fillColor(C_GRAY).font('Helvetica-Bold').fontSize(7.5).text('Methodology:', MARGIN, doc.y);
        doc.y = doc.y + 2;
        doc.fillColor(C_DARK).font('Helvetica').fontSize(8.5).lineGap(2)
           .text(methText, MARGIN + 10, doc.y, {width: CONTENT_W - 10, align:'justify'});
        doc.y += 14;

        // ═══════════════════════════════════════════════════════════════════
        // SECTION 6 — PLATFORM CAPABILITIES
        // ═══════════════════════════════════════════════════════════════════
        need(120);
        hRule(doc.y); doc.y += 12;
        sectionLabel('6. GeoMiner AI Platform Capabilities', doc.y);
        doc.y += 26;

        const caps = [
            ['GIS Map Selection',     'Interactive map with click-to-point and coordinate search. 5 km exploration zone auto-plotted.'],
            ['Hybrid ML Engine',      '25 km occurrence buffer + Random Forest on NGCM (10,004 records). Belt detection independent of NGCM coverage.'],
            ['Belt Recognition',      'Kolar Gold Field, Bellary Iron Belt, Sandur Schist Belt, Chitradurga Belt, Kurnool Diamond Zone.'],
            ['PDF Reports',           'Full geological report: mineral inventory, concentrations, XAI interpretation, documented occurrences.'],
        ];
        need(110);
        caps.forEach(([title, desc], i) => {
            const cx = i % 2 === 0 ? MARGIN : MARGIN + CONTENT_W / 2 + 5;
            const cy = doc.y + Math.floor(i / 2) * 50;
            box(cx, cy, CONTENT_W / 2 - 5, 44, C_LBG);
            doc.fillColor(C_BLUE).font('Helvetica-Bold').fontSize(8).text(`• ${title}`, cx + 8, cy + 7, {lineBreak:false});
            doc.fillColor(C_GRAY).font('Helvetica').fontSize(7.5).lineGap(1.5)
               .text(desc, cx + 8, cy + 20, {width: CONTENT_W/2 - 22, lineBreak: true});
        });
        doc.y += 108;

        // ═══════════════════════════════════════════════════════════════════
        // FOOTER  — drawn at the CURRENT bottom of the last page
        // ═══════════════════════════════════════════════════════════════════
        // Ensure footer fits on current page, otherwise add a page
        need(60);
        const footerY = PAGE_H - 58;
        doc.save()
           .rect(0, footerY - 4, PAGE_W, 62).fillColor(C_DARK).fill().restore();
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(7)
           .text('DISCLAIMER: This report is generated by GeoMiner AI using mathematical predictive models trained on publicly available databases (NGCM, GSI). Scores are probabilistic estimates and do not guarantee economic mineral deposits. All exploration activities should be verified through certified geological field surveys before investment decisions.',
               MARGIN, footerY + 2, {align:'center', width: CONTENT_W, lineGap:1.5});
        doc.fillColor(C_LBLUE).font('Helvetica-Bold').fontSize(7.5)
           .text('GeoMiner AI  |  ML Mineral Intelligence Platform  |  v2.0',
               MARGIN, footerY + 32, {align:'center', width: CONTENT_W, lineBreak: false});

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

