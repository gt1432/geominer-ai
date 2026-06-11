from flask_cors import CORS
from flask import Flask, request, jsonify
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
import numpy as np
import os

app = Flask(__name__)
CORS(app)

model = load_model("soil_model.h5")

classes = [
    "Black Soil",
    "Cinder Soil",
    "Laterite Soil",
    "Peat Soil",
    "Yellow Soil"
]

UPLOAD_FOLDER = "C:/Users/Pressi/Desktop/PyCharm 2025.3.3/AgriSmart/backend/uploads"

@app.route("/predict-soil", methods=["POST"])
def predict_soil():
    print("REQUEST RECEIVED")
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"})

    file = request.files["image"]

    filepath = os.path.join(
        UPLOAD_FOLDER,
        file.filename
    )

    file.save(filepath)

    img = image.load_img(
        filepath,
        target_size=(224, 224)
    )

    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = img_array / 255.0

    prediction = model.predict(img_array)

    index = np.argmax(prediction)

    confidence = float(
        np.max(prediction) * 100
    )

    return jsonify({
        "soil": classes[index],
        "confidence": round(confidence, 2)
    })

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5001,
        debug=True
    )