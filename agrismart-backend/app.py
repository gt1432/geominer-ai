from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd
import os

app = Flask(__name__)
CORS(app)

# Load model with absolute path to avoid reload issues
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = joblib.load(os.path.join(BASE_DIR, "model.pkl"))
rainfall_df = pd.read_csv(os.path.join(BASE_DIR, "rainfall.csv"))

FEATURE_COLUMNS = ['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall']

@app.route("/")
def home():
    return "AgriSmart Crop Prediction API — Running ✅"

@app.route("/health")
def health():
    crop_exists = os.path.exists(os.path.join(BASE_DIR, "model.pkl"))
    soil_exists = os.path.exists(os.path.join(BASE_DIR, "soil_features.json"))
    return jsonify({
        "status": "healthy",
        "crop_model": crop_exists,
        "soil_model": soil_exists
    })

@app.route("/model-status")
def model_status():
    crop_exists = os.path.exists(os.path.join(BASE_DIR, "model.pkl"))
    soil_exists = os.path.exists(os.path.join(BASE_DIR, "soil_features.json"))
    return jsonify({
        "crop_prediction": "loaded" if crop_exists else "not_found",
        "soil_prediction": "loaded" if soil_exists else "not_found"
    })

@app.route("/rainfall/<state>")
def get_rainfall(state):
    state = state.upper()
    data = rainfall_df[rainfall_df["STATE_UT_NAME"].str.upper() == state]
    if len(data) == 0:
        return jsonify({"rainfall": 200})
    avg_rainfall = round(data["ANNUAL"].mean(), 2)
    return jsonify({"rainfall": avg_rainfall})

@app.route("/rainfall")
def rainfall():
    city = request.args.get("city", "").upper()
    data = rainfall_df[rainfall_df["DISTRICT"].str.upper() == city]
    if len(data) == 0:
        # Try state match
        state_data = rainfall_df[rainfall_df["STATE_UT_NAME"].str.upper() == city]
        if len(state_data) > 0:
            return jsonify({"rainfall": round(float(state_data["ANNUAL"].mean()), 2)})
        return jsonify({"rainfall": 200})
    return jsonify({"rainfall": round(float(data["ANNUAL"].iloc[0]), 2)})

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        # Validate required fields
        missing = [col for col in FEATURE_COLUMNS if col not in data]
        if missing:
            return jsonify({"error": f"Missing fields: {missing}"}), 400

        # Use DataFrame so feature names match training
        sample = pd.DataFrame([[
            float(data["N"]),
            float(data["P"]),
            float(data["K"]),
            float(data["temperature"]),
            float(data["humidity"]),
            float(data["ph"]),
            float(data["rainfall"])
        ]], columns=FEATURE_COLUMNS)

        probabilities = model.predict_proba(sample)[0]
        classes = model.classes_

        predictions = [
            {"crop": crop, "confidence": round(prob * 100, 2)}
            for crop, prob in zip(classes, probabilities)
        ]
        predictions.sort(key=lambda x: x["confidence"], reverse=True)

        return jsonify({
            "best_crop": predictions[0],
            "top3": predictions[:3],
            "all": predictions
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/test")
def test():
    sample = pd.DataFrame([[90, 42, 43, 20.87, 82.0, 6.5, 202.9]], columns=FEATURE_COLUMNS)
    prediction = model.predict(sample)
    probabilities = model.predict_proba(sample)[0]
    classes = model.classes_
    top3 = sorted(zip(classes, probabilities), key=lambda x: -x[1])[:3]
    return jsonify({
        "prediction": prediction[0],
        "top3": [{"crop": c, "confidence": round(p * 100, 2)} for c, p in top3]
    })

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,   # No auto-reloader — prevents connection resets
        use_reloader=False
    )