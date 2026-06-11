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
    lithology: {
        type: String,
        default: 'Unknown'
    },
    geological_unit: {
        type: String,
        default: 'Unknown'
    },
    formation: {
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
    rock_type_probabilities: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    rock_type_class: {
        type: String,
        default: 'Unknown'
    },
    rock_type_confidence: {
        type: Number,
        default: 0.0
    },
    rock_formation_description: {
        type: String,
        default: ''
    },
    associated_minerals: {
        type: [String],
        default: []
    },
    suitability_score: {
        type: Number,
        default: 0.0
    },
    suitability_category: {
        type: String,
        default: 'Poor'
    },
    correlation_details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    ai_insights: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    saved_project: {
        type: Boolean,
        default: false
    },
    image_path: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Prediction', PredictionSchema);
