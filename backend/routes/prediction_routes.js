const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/prediction_controller');

// 1. POST /predict -> Invoke model prediction and log search
router.post('/predict', predictionController.predictMineralPotential);

// 2. GET /predictions -> Get list of all logged predictions
router.get('/predictions', predictionController.getPredictionsHistory);

// 3. GET /stats -> Fetch dashboard aggregate statistics
router.get('/stats', predictionController.getDashboardStats);

// 4. GET /predictions/:id/pdf -> Download PDF Report document
router.get('/predictions/:id/pdf', predictionController.downloadPdfReport);

// 5. GET /occurrences -> Fetch known mineral occurrences from CSV database
router.get('/occurrences', predictionController.getOccurrences);

// 6. GET /geocode -> Run Nominatim or Google geocoding queries
router.get('/geocode', predictionController.geocodeLocation);

module.exports = router;
