from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd

app = Flask(__name__)
CORS(app)

model = joblib.load("model.pkl")
rainfall_df = pd.read_csv("rainfall.csv")

@app.route("/")
def home():
    return "AgriSmart API Running"
@app.route("/rainfall/<state>")
def get_rainfall(state):

    state = state.upper()

    data = rainfall_df[
        rainfall_df["STATE_UT_NAME"].str.upper() == state
    ]

    if len(data) == 0:
        return jsonify({
            "rainfall": 200
        })

    avg_rainfall = round(
        data["ANNUAL"].mean(),
        2
    )

    return jsonify({
        "rainfall": avg_rainfall
    })
@app.route("/rainfall")
def rainfall():

    city = request.args.get("city", "").upper()

    data = rainfall_df[
        rainfall_df["DISTRICT"].str.upper() == city
    ]

    if len(data) == 0:

        return jsonify({
            "rainfall": 200
        })

    return jsonify({
        "rainfall": float(
            data["ANNUAL"].iloc[0]
        )
    })
@app.route("/predict", methods=["POST"])
def predict():

    data = request.get_json()

    sample = [[
        data["N"],
        data["P"],
        data["K"],
        data["temperature"],
        data["humidity"],
        data["ph"],
        data["rainfall"]
    ]]

    probabilities = model.predict_proba(sample)[0]
    classes = model.classes_

    predictions = []

    for crops, prob in zip(classes, probabilities):
        predictions.append({
            "crop": crops,
            "confidence": round(prob * 100, 2)
        })

    predictions.sort(
        key=lambda x: x["confidence"],
        reverse=True
    )

    return jsonify({
        "best_crop": predictions[0],
        "top3": predictions[:3]
    })


@app.route("/test")
def test():

    sample = [[90, 42, 43, 20.87, 82.0, 6.5, 202.9]]

    prediction = model.predict(sample)

    return prediction[0]


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )