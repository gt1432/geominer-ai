const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { connectDb } = require('./database/mongodb_connection');

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Body Parser Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static frontend files from 'frontend' folder
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Mount Mongoose Models first
require('./models/prediction');

// Connect to Database (with offline JSON fallback)
connectDb();

// Load Routes (mounted directly at root for POST /predict, GET /predictions, etc.)
const predictionRoutes = require('./routes/prediction_routes');
app.use('/', predictionRoutes);

// Fallback HTML routing for index
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`=== GeoMiner AI Server Listening on Port ${PORT} ===`);
    console.log(`Frontend served at: http://localhost:${PORT}`);
});
