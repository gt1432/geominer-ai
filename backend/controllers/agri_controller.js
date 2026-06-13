const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PYTHON_PATH = process.env.PYTHON_PATH || (
    process.platform === 'win32'
        ? 'C:\\Python312\\python.exe'
        : '/opt/venv/bin/python3'
);

const CROP_CLI_PATH = path.join(__dirname, '..', '..', 'agrismart-backend', 'predict_crop_cli.py');
const SOIL_CLI_PATH = path.join(__dirname, '..', '..', 'agrismart-backend', 'predict_soil_cli.py');
const RAINFALL_CSV_PATH = path.join(__dirname, '..', '..', 'agrismart-backend', 'rainfall.csv');
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'agrismart-backend', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Cache the rainfall data
let rainfallData = [];

function loadRainfallData() {
    if (rainfallData.length > 0) return;
    try {
        if (fs.existsSync(RAINFALL_CSV_PATH)) {
            const content = fs.readFileSync(RAINFALL_CSV_PATH, 'utf8');
            const lines = content.split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const parts = line.split(',');
                if (parts.length >= headers.length) {
                    const row = {};
                    headers.forEach((h, index) => {
                        row[h] = parts[index].trim();
                    });
                    rainfallData.push(row);
                }
            }
            console.log(`Loaded ${rainfallData.length} records from rainfall.csv`);
        } else {
            console.warn(`Rainfall CSV not found at ${RAINFALL_CSV_PATH}`);
        }
    } catch (err) {
        console.error('Failed to load rainfall CSV data:', err);
    }
}

function parseMultipart(buffer, boundary) {
    const boundaryBuffer = Buffer.from('--' + boundary);
    const index = buffer.indexOf(boundaryBuffer);
    if (index === -1) return null;
    
    const headerEndIndex = buffer.indexOf('\r\n\r\n', index);
    if (headerEndIndex === -1) return null;
    
    const headers = buffer.slice(index, headerEndIndex).toString();
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const filename = filenameMatch ? filenameMatch[1] : 'soil.jpg';
    
    const dataStart = headerEndIndex + 4;
    const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, dataStart);
    if (nextBoundaryIndex === -1) return null;
    
    const dataEnd = nextBoundaryIndex - 2;
    if (dataEnd <= dataStart) return null;
    
    const fileData = buffer.slice(dataStart, dataEnd);
    return { filename, data: fileData };
}

function runSoilPrediction(filePath, res, callback) {
    execFile(PYTHON_PATH, [SOIL_CLI_PATH, filePath], { timeout: 30000 }, (error, stdout, stderr) => {
        if (callback) callback();
        
        if (error) {
            console.error('Python soil prediction failed:', error, stderr);
            return res.status(500).json({ error: error.message, details: stderr });
        }
        try {
            const result = JSON.parse(stdout.trim());
            return res.status(200).json(result);
        } catch (e) {
            return res.status(500).json({ error: 'Failed to parse soil prediction output', raw: stdout });
        }
    });
}

exports.getRainfall = (req, res) => {
    loadRainfallData();
    let city = (req.query.city || '').trim().toUpperCase();
    
    let matched = rainfallData.filter(row => row.DISTRICT && row.DISTRICT.toUpperCase() === city);
    if (matched.length > 0) {
        const annual = parseFloat(matched[0].ANNUAL);
        return res.status(200).json({ rainfall: Math.round(annual) });
    }
    
    matched = rainfallData.filter(row => row.STATE_UT_NAME && row.STATE_UT_NAME.toUpperCase() === city);
    if (matched.length > 0) {
        const sum = matched.reduce((acc, row) => acc + parseFloat(row.ANNUAL || 0), 0);
        const avg = sum / matched.length;
        return res.status(200).json({ rainfall: Math.round(avg * 100) / 100 });
    }
    
    return res.status(200).json({ rainfall: 200 });
};

exports.getRainfallByState = (req, res) => {
    loadRainfallData();
    let state = (req.params.state || '').trim().toUpperCase();
    
    const matched = rainfallData.filter(row => row.STATE_UT_NAME && row.STATE_UT_NAME.toUpperCase() === state);
    if (matched.length > 0) {
        const sum = matched.reduce((acc, row) => acc + parseFloat(row.ANNUAL || 0), 0);
        const avg = sum / matched.length;
        return res.status(200).json({ rainfall: Math.round(avg * 100) / 100 });
    }
    
    return res.status(200).json({ rainfall: 200 });
};

exports.predictCrop = (req, res) => {
    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No JSON data provided" });
    }
    
    // Ensure numbers are correctly formatted strings
    const nVal = (data.N !== undefined ? data.N : 0).toString();
    const pVal = (data.P !== undefined ? data.P : 0).toString();
    const kVal = (data.K !== undefined ? data.K : 0).toString();
    const tempVal = (data.temperature !== undefined ? data.temperature : 0).toString();
    const humVal = (data.humidity !== undefined ? data.humidity : 0).toString();
    const phVal = (data.ph !== undefined ? data.ph : 0).toString();
    const rainVal = (data.rainfall !== undefined ? data.rainfall : 0).toString();
    
    const args = [
        CROP_CLI_PATH,
        '--n', nVal,
        '--p', pVal,
        '--k', kVal,
        '--temp', tempVal,
        '--hum', humVal,
        '--ph', phVal,
        '--rain', rainVal
    ];
    
    execFile(PYTHON_PATH, args, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Python crop prediction failed:', error, stderr);
            return res.status(500).json({ error: error.message, details: stderr });
        }
        try {
            const result = JSON.parse(stdout.trim());
            return res.status(200).json(result);
        } catch (e) {
            return res.status(500).json({ error: 'Failed to parse prediction output', raw: stdout });
        }
    });
};

exports.predictSoil = (req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        
        if (!boundaryMatch) {
            return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
        }
        
        const boundary = boundaryMatch[1];
        const parsed = parseMultipart(buffer, boundary);
        
        if (!parsed || !parsed.data) {
            const fakePath = path.join(UPLOADS_DIR, 'dummy.jpg');
            return runSoilPrediction(fakePath, res);
        }
        
        const tempFilename = `upload_${Date.now()}_${parsed.filename}`;
        const tempPath = path.join(UPLOADS_DIR, tempFilename);
        
        try {
            fs.writeFileSync(tempPath, parsed.data);
            runSoilPrediction(tempPath, res, () => {
                try {
                    fs.unlinkSync(tempPath);
                } catch (err) {
                    console.error('Failed to clean up temp file:', err);
                }
            });
        } catch (err) {
            console.error('Failed to write uploaded file:', err);
            return res.status(500).json({ error: 'Failed to save uploaded file' });
        }
    });
};

exports.getHealth = (req, res) => {
    const cropModelPath = path.join(__dirname, '..', '..', 'agrismart-backend', 'model.pkl');
    const soilModelPath = path.join(__dirname, '..', '..', 'agrismart-backend', 'soil_features.json');
    
    const cropModelExists = fs.existsSync(cropModelPath);
    const soilModelExists = fs.existsSync(soilModelPath);
    
    return res.status(200).json({
        status: "healthy",
        crop_model: cropModelExists,
        soil_model: soilModelExists
    });
};

exports.getModelStatus = (req, res) => {
    const cropModelPath = path.join(__dirname, '..', '..', 'agrismart-backend', 'model.pkl');
    const soilModelPath = path.join(__dirname, '..', '..', 'agrismart-backend', 'soil_features.json');
    
    const cropModelExists = fs.existsSync(cropModelPath);
    const soilModelExists = fs.existsSync(soilModelPath);
    
    return res.status(200).json({
        crop_prediction: cropModelExists ? "loaded" : "not_found",
        soil_prediction: soilModelExists ? "loaded" : "not_found"
    });
};

