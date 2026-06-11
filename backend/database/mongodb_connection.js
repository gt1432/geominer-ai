const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const FALLBACK_DB_PATH = path.join(__dirname, 'local_db.json');

// Default URI
let MONGO_URI = 'mongodb://localhost:27017/geominer';

// Try to load URI from .env file
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
    try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('MONGODB_URI=')) {
                const uriVal = trimmed.substring('MONGODB_URI='.length).trim();
                if (uriVal) {
                    MONGO_URI = uriVal.replace(/['"]/g, ''); // strip single/double quotes
                }
            }
        }
    } catch (e) {
        console.error('Failed to parse .env file:', e);
    }
}

let isFallbackMode = false;

// Initialize the local JSON file database if it doesn't exist
if (!fs.existsSync(FALLBACK_DB_PATH)) {
    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify([], null, 2));
}

// Connect to MongoDB
const connectDb = async () => {
    try {
        mongoose.set('strictQuery', false);
        const maskedUri = MONGO_URI.replace(/:([^:@]+)@/, ':******@');
        console.log(`Connecting to MongoDB at: ${maskedUri}...`);
        
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000 // 5 seconds timeout for remote Atlas servers
        });
        console.log('MongoDB connected successfully.');
        isFallbackMode = false;
    } catch (err) {
        console.warn('MongoDB connection failed. Switching to offline Local JSON Fallback database.');
        isFallbackMode = true;
    }
};

// Local JSON File Helper Functions
const readLocalDb = () => {
    try {
        const data = fs.readFileSync(FALLBACK_DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading local database file:', err);
        return [];
    }
};

const writeLocalDb = (data) => {
    try {
        fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error writing local database file:', err);
    }
};

// Public database service wrapper
const dbService = {
    isFallback: () => isFallbackMode,
    
    savePrediction: async (predictionData) => {
        if (!isFallbackMode) {
            try {
                const Prediction = mongoose.model('Prediction');
                const newPrediction = new Prediction(predictionData);
                return await newPrediction.save();
            } catch (err) {
                console.error('MongoDB write failed. Saving to local database fallback.', err);
                // Fall through to local JSON fallback below
            }
        }
        
        // Local JSON Fallback Saving (also used when MongoDB write fails)
        const db = readLocalDb();
        const doc = {
            _id: Math.random().toString(16).substring(2, 14) + Math.random().toString(16).substring(2, 14),
            ...predictionData,
            createdAt: new Date().toISOString()
        };
        db.push(doc);
        writeLocalDb(db);
        return doc;
    },
    
    getPredictions: async () => {
        if (!isFallbackMode) {
            try {
                const Prediction = mongoose.model('Prediction');
                return await Prediction.find().sort({ createdAt: -1 });
            } catch (err) {
                console.error('MongoDB read failed. Reading from local database fallback.', err);
            }
        }
        
        // Fallback JSON retrieval
        const db = readLocalDb();
        // Sort descending by createdAt
        return db.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    
    getPredictionById: async (id) => {
        if (!isFallbackMode) {
            try {
                const Prediction = mongoose.model('Prediction');
                return await Prediction.findById(id);
            } catch (err) {
                console.error('MongoDB read failed. Reading from local database fallback.', err);
            }
        }
        
        // Fallback JSON retrieval by ID
        const db = readLocalDb();
        const found = db.find(item => item._id === id);
        if (!found) return null;
        return found;
    },
    
    getStats: async () => {
        const list = await dbService.getPredictions();
        const count = list.length;
        
        let avgProb = 0.0;
        let avgSuit = 0.0;
        let highCount = 0;
        let savedCount = 0;
        if (count > 0) {
            const sumProb = list.reduce((sum, item) => sum + (item.mineral_probability || 0), 0);
            avgProb = sumProb / count;
            
            const sumSuit = list.reduce((sum, item) => sum + (item.suitability_score || 0), 0);
            avgSuit = sumSuit / count;
            
            highCount = list.filter(item => item.confidence === 'High' || item.risk_level === 'High').length;
            savedCount = list.filter(item => item.saved_project === true).length;
        }
        
        return {
            totalPredictions: count,
            averageProbability: Math.round(avgProb * 100) / 100,
            averageSuitability: Math.round(avgSuit * 10) / 10,
            highConfidenceCount: highCount,
            savedProjectsCount: savedCount,
            predictionsList: list
        };
    }
};

module.exports = {
    connectDb,
    dbService
};
