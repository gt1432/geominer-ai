const mongoose = require('mongoose');

const PredictionSchema = new mongoose.Schema({
    latitude: {
        type: Number,
        required: true
    },
    longitude: {
        type: Number,
        required: true
    },
    fe: {
        type: Number,
        required: true
    },
    cu: {
        type: Number,
        required: true
    },
    zn: {
        type: Number,
        required: true
    },
    altitude: {
        type: Number,
        default: 450.0
    },
    rock_type: {
        type: String,
        required: true
    },
    mineral_probability: {
        type: Number, // Percentage, e.g. 91
        required: true
    },
    predicted_minerals: {
        type: [String],
        required: true
    },
    mineral_percentages: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    confidence: {
        type: String, // "High", "Medium", "Low"
        required: true
    },
    geological_zone: {
        type: String,
        default: 'Unknown'
    },
    nearest_mineral: {
        type: String,
        default: 'Unknown'
    },
    nearest_mineral_dist_km: {
        type: Number,
        default: 0.0
    },
    explanation: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Prediction', PredictionSchema);
