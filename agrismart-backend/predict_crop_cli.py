import sys
import os
import json
import joblib
import pandas as pd
import argparse

# Load model
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(BASE_DIR, "model.pkl")

try:
    model = joblib.load(model_path)
except Exception as e:
    print(json.dumps({"error": f"Failed to load model: {str(e)}"}))
    sys.exit(1)

# Read inputs from command line arguments
parser = argparse.ArgumentParser()
parser.add_argument('--n', type=float, required=True)
parser.add_argument('--p', type=float, required=True)
parser.add_argument('--k', type=float, required=True)
parser.add_argument('--temp', type=float, required=True)
parser.add_argument('--hum', type=float, required=True)
parser.add_argument('--ph', type=float, required=True)
parser.add_argument('--rain', type=float, required=True)

try:
    args = parser.parse_args()
    FEATURE_COLUMNS = ['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall']
    
    sample = pd.DataFrame([[
        args.n,
        args.p,
        args.k,
        args.temp,
        args.hum,
        args.ph,
        args.rain
    ]], columns=FEATURE_COLUMNS)
    
    probabilities = model.predict_proba(sample)[0]
    classes = model.classes_
    
    predictions = [
        {"crop": crop, "confidence": round(prob * 100, 2)}
        for crop, prob in zip(classes, probabilities)
    ]
    predictions.sort(key=lambda x: x["confidence"], reverse=True)
    
    print(json.dumps({
        "best_crop": predictions[0],
        "top3": predictions[:3],
        "all": predictions
    }))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
