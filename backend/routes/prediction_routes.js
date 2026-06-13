const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/prediction_controller');
const agriController = require('../controllers/agri_controller');

// 1. POST /predict -> Invoke model prediction and log search (GeoMiner)
router.post('/predict', predictionController.predictMineralPotential);

// 2. GET /predictions -> Get list of all logged predictions
router.get('/predictions', predictionController.getPredictionsHistory);

// 3. GET /stats -> Fetch dashboard aggregate statistics
router.get('/stats', predictionController.getDashboardStats);

// 4. GET /predictions/:id/pdf -> Download PDF Report document
router.get('/predictions/:id/pdf', predictionController.downloadPdfReport);

// 4a. POST /predictions/:id/save -> Toggle saved state
router.post('/predictions/:id/save', predictionController.savePredictionToggle);

// 4b. GET /predictions/:id/csv -> Download CSV Report document
router.get('/predictions/:id/csv', predictionController.downloadCsvReport);

// 4c. GET /predictions/:id/json -> Download JSON Report document
router.get('/predictions/:id/json', predictionController.downloadJsonReport);

// 5. GET /occurrences -> Fetch known mineral occurrences from CSV database
router.get('/occurrences', predictionController.getOccurrences);

// 6. GET /geocode -> Run Nominatim or Google geocoding queries
router.get('/geocode', predictionController.geocodeLocation);

// 7. GET /diagnose -> Developer pipeline diagnostic for a coordinate
router.get('/diagnose', predictionController.diagnosePrediction);

// --- Agriculture Routes ---
// 8. GET /rainfall -> Fetch historical rainfall data
router.get('/rainfall', agriController.getRainfall);
router.get('/rainfall/:state', agriController.getRainfallByState);

// 9. POST /crop-predict -> Run ML crop recommendation classification
router.post('/crop-predict', agriController.predictCrop);

// 10. POST /predict-soil -> Run ML soil type image classification
router.post('/predict-soil', agriController.predictSoil);

// 11. GET /health -> Check system health
router.get('/health', agriController.getHealth);

// 12. GET /model-status -> Check model loading status
router.get('/model-status', agriController.getModelStatus);

module.exports = router;

