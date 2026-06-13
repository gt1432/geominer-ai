import sys
import os
import json
import numpy as np
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

classes = [
    "Sandy Soil",
    "Clay Soil",
    "Loamy Soil",
    "Silt Soil",
    "Black Soil",
    "Red Soil",
    "Laterite Soil",
    "Alluvial Soil",
    "Peaty Soil",
    "Chalky Soil",
    "Cinder Soil",
    "Yellow Soil"
]

SOIL_DETAILS = {
    "Sandy Soil": {
        "characteristics": "High drainage, low water retention, very loose sandy texture.",
        "retention": "Low",
        "fertility": "Low",
        "drainage": "High",
        "suitable": "Maize, Melon, Groundnut, Coconut"
    },
    "Clay Soil": {
        "characteristics": "High water retention, poor drainage, dense and heavy sticky texture.",
        "retention": "High",
        "fertility": "High",
        "drainage": "Low",
        "suitable": "Rice, Wheat, Sugarcane, Cotton"
    },
    "Loamy Soil": {
        "characteristics": "Ideal balance of sand, silt, and clay. Rich in nutrients and humus.",
        "retention": "Medium-High",
        "fertility": "Very High",
        "drainage": "Good",
        "suitable": "Wheat, Cotton, Sugarcane, Pulses"
    },
    "Silt Soil": {
        "characteristics": "Fine-textured, smooth, retains moisture well, medium fertility.",
        "retention": "Medium",
        "fertility": "Medium-High",
        "drainage": "Medium",
        "suitable": "Rice, Wheat, Jute, Vegetables"
    },
    "Peaty Soil": {
        "characteristics": "High organic content, acidic, dark, spongy, retains a lot of water.",
        "retention": "Very High",
        "fertility": "High",
        "drainage": "Poor",
        "suitable": "Potato, Blueberry, Root Vegetables, Brassicas"
    },
    "Chalky Soil": {
        "characteristics": "Highly alkaline, stony, free-draining, prone to dryness in summer.",
        "retention": "Low",
        "fertility": "Low",
        "drainage": "Very High",
        "suitable": "Barley, Sugar Beet, Spinach, Cabbage"
    },
    "Black Soil": {
        "characteristics": "Extremely fertile, high clay content, deep cracks in summer, high water retention.",
        "retention": "High",
        "fertility": "Very High",
        "drainage": "Medium-Low",
        "suitable": "Cotton, Wheat, Citrus, Linseed"
    },
    "Red Soil": {
        "characteristics": "Rich in iron oxides, porous, low water retention, responds well to fertilizers.",
        "retention": "Medium-Low",
        "fertility": "Medium",
        "drainage": "Good",
        "suitable": "Groundnut, Millets, Tobacco, Pulses"
    },
    "Laterite Soil": {
        "characteristics": "Acidic, leached of nutrients, rich in iron and aluminum oxides.",
        "retention": "Low",
        "fertility": "Low-Medium",
        "drainage": "Good",
        "suitable": "Cashew, Tea, Coffee, Rubber"
    },
    "Alluvial Soil": {
        "characteristics": "Extremely fertile silt, deposited by rivers, rich in potash and lime.",
        "retention": "High",
        "fertility": "Extremely High",
        "drainage": "Good",
        "suitable": "Rice, Wheat, Sugarcane, Jute"
    },
    "Cinder Soil": {
        "characteristics": "Porous, volcanic origin, low moisture retention, lightweight.",
        "retention": "Low",
        "fertility": "Low",
        "drainage": "High",
        "suitable": "Cacti, Succulents, Root Crops"
    },
    "Yellow Soil": {
        "characteristics": "Similar to red soil but highly hydrated, medium fertility.",
        "retention": "Medium-Low",
        "fertility": "Medium",
        "drainage": "Good",
        "suitable": "Groundnut, Millets, Tobacco, Pulses"
    },
    "Peat Soil": {
        "characteristics": "High organic content, acidic, dark, spongy, retains a lot of water.",
        "retention": "Very High",
        "fertility": "High",
        "drainage": "Poor",
        "suitable": "Potato, Blueberry, Root Vegetables, Brassicas"
    }
}

def validate_and_predict_soil(filepath):
    try:
        # Load image and convert to RGB
        img = Image.open(filepath).convert('RGB')
        
        # 1. Image Quality Checks
        # Resize to a standard size for consistent gradient scale
        img_check = img.resize((256, 256))
        arr_check = np.array(img_check, dtype=np.float32)
        
        # Convert to Grayscale for brightness and blur check
        gray = 0.2989 * arr_check[:,:,0] + 0.5870 * arr_check[:,:,1] + 0.1140 * arr_check[:,:,2]
        
        # Brightness check
        mean_brightness = np.mean(gray)
        if mean_brightness < 40.0:
            return None, "Low-light image detected. Please capture or upload a brighter, clearer photo of the soil."
        if mean_brightness > 235.0:
            return None, "Overexposed or white/blank image detected. Please capture or upload a clearer photo of the soil."
            
        # Sharpness/Blur check
        gy, gx = np.gradient(gray)
        gnorm = np.sqrt(gx**2 + gy**2)
        sharpness = np.var(gnorm)
        if sharpness < 12.0:
            return None, "Blurry image detected. Please hold the camera steady and capture a sharper photo."
            
        # Non-soil check in HSV space
        # Convert RGB to HSV
        r, g, b = arr_check[:,:,0]/255.0, arr_check[:,:,1]/255.0, arr_check[:,:,2]/255.0
        mx = np.maximum(r, np.maximum(g, b))
        mn = np.minimum(r, np.minimum(g, b))
        df = mx - mn
        
        # Avoid division by zero
        df_safe = np.where(df == 0, 1.0, df)
        h = np.zeros_like(mx)
        h = np.where(mx == r, (60 * ((g - b) / df_safe) + 360) % 360, h)
        h = np.where(mx == g, (60 * ((b - r) / df_safe) + 120) % 360, h)
        h = np.where(mx == b, (60 * ((r - g) / df_safe) + 240) % 360, h)
        h = np.where(df == 0, 0, h)
        
        s = np.where(mx == 0, 0, (df / np.where(mx == 0, 1.0, mx)) * 100)
        v = mx * 100
        
        # Soil Hue is typically between 0 and 50 degrees (reds, browns, yellows)
        # We also allow low saturation (S < 22) for neutral/gray/whitish chalky soils
        is_soil = ((h >= 0) & (h <= 50)) | (h >= 330) | (s < 22)
        soil_pixel_ratio = np.sum(is_soil) / is_soil.size
        
        # If less than 75% of pixels resemble soil, reject
        if soil_pixel_ratio < 0.75:
            return None, "Non-soil image detected. Please upload an image containing only soil."

        # 2. Prediction Pipeline (Weighted KNN with centroid fallback)
        avg_r = float(np.mean(r))
        avg_g = float(np.mean(g))
        avg_b = float(np.mean(b))
        
        # Calculate HSV of the average RGB
        mx_avg = max(avg_r, avg_g, avg_b)
        mn_avg = min(avg_r, avg_g, avg_b)
        df_avg = mx_avg - mn_avg
        if mx_avg == mn_avg:
            avg_h = 0.0
        elif mx_avg == avg_r:
            avg_h = (60 * ((avg_g - avg_b) / df_avg) + 360) % 360
        elif mx_avg == avg_g:
            avg_h = (60 * ((avg_b - avg_r) / df_avg) + 120) % 360
        elif mx_avg == avg_b:
            avg_h = (60 * ((avg_r - avg_g) / df_avg) + 240) % 360
            
        avg_s = 0.0 if mx_avg == 0 else (df_avg / mx_avg) * 100.0
        avg_v = mx_avg * 100.0
        
        try:
            json_path = os.path.join(BASE_DIR, "soil_features.json")
            with open(json_path, 'r') as f:
                knn_data = json.load(f)
                
            f_input = np.array([avg_r, avg_g, avg_b, avg_h/360.0, avg_s/100.0, avg_v/100.0])
            
            # Compute Euclidean distances to all samples
            distances = []
            for item in knn_data:
                f_sample = np.array(item["features"])
                d = np.sqrt(np.sum((f_input - f_sample)**2))
                distances.append((item["label"], d))
                
            # Sort by distance
            distances.sort(key=lambda x: x[1])
            
            # Take K nearest neighbors
            K = 11
            neighbors = distances[:K]
            
            # Weighted voting
            weights = {}
            epsilon = 1e-5
            for label, d in neighbors:
                w = 1.0 / (d + epsilon)
                weights[label] = weights.get(label, 0.0) + w
                
            total_w = sum(weights.values())
            probabilities = {cls: (w / total_w) * 100.0 for cls, w in weights.items()}
            
            best_class = max(weights, key=weights.get)
            best_confidence = probabilities[best_class]
            
        except Exception as err:
            # Fallback to centroid-based method if JSON fails to load
            class_centers = {
                "Sandy Soil":    {"rgb": (0.75, 0.65, 0.48), "hsv": (36.0, 35.0, 75.0)},
                "Clay Soil":     {"rgb": (0.42, 0.36, 0.30), "hsv": (28.0, 28.0, 42.0)},
                "Loamy Soil":    {"rgb": (0.34, 0.28, 0.22), "hsv": (24.0, 35.0, 34.0)},
                "Silt Soil":     {"rgb": (0.50, 0.44, 0.38), "hsv": (30.0, 24.0, 50.0)},
                "Black Soil":    {"rgb": (0.2368, 0.1987, 0.1815), "hsv": (18.7, 23.4, 23.7)},
                "Red Soil":      {"rgb": (0.64, 0.36, 0.26), "hsv": (12.0, 58.0, 64.0)},
                "Laterite Soil": {"rgb": (0.6407, 0.3714, 0.2600), "hsv": (17.6, 59.4, 64.1)},
                "Alluvial Soil": {"rgb": (0.60, 0.55, 0.48), "hsv": (32.0, 20.0, 60.0)},
                "Peaty Soil":    {"rgb": (0.4586, 0.3686, 0.3233), "hsv": (20.1, 29.5, 45.9)},
                "Chalky Soil":   {"rgb": (0.80, 0.78, 0.74), "hsv": (35.0, 8.0, 80.0)},
                "Cinder Soil":   {"rgb": (0.4693, 0.4147, 0.3986), "hsv": (13.7, 15.1, 46.9)},
                "Yellow Soil":   {"rgb": (0.7063, 0.5195, 0.2575), "hsv": (35.0, 63.6, 70.6)}
            }
            
            distances = {}
            for cls, center in class_centers.items():
                rgb_center = center["rgb"]
                hsv_center = center["hsv"]
                dist_rgb = np.sqrt((avg_r - rgb_center[0])**2 + (avg_g - rgb_center[1])**2 + (avg_b - rgb_center[2])**2)
                dh = min(abs(avg_h - hsv_center[0]), 360 - abs(avg_h - hsv_center[0])) / 360.0
                ds = abs(avg_s - hsv_center[1]) / 100.0
                dv = abs(avg_v - hsv_center[2]) / 100.0
                dist_hsv = np.sqrt(dh**2 + ds**2 + dv**2)
                distances[cls] = 0.7 * dist_rgb + 0.3 * dist_hsv
                
            beta = 18.0
            exps = {cls: np.exp(-dist * beta) for cls, dist in distances.items()}
            sum_exps = sum(exps.values())
            probabilities = {cls: (val / sum_exps) * 100.0 for cls, val in exps.items()}
            
            best_class = min(distances, key=distances.get)
            best_confidence = probabilities[best_class]
        
        # Confidence threshold check
        if best_confidence < 25.0:
            return None, "Low confidence prediction. Please provide a clearer and more direct photo of the soil."
            
        return best_class, round(float(best_confidence), 2)
        
    except Exception as e:
        return None, f"Soil prediction pipeline error: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)
        
    filepath = sys.argv[1]
    
    if not os.path.exists(filepath):
        print(json.dumps({"error": f"Image file not found: {os.path.basename(filepath)}"}))
        sys.exit(0)
        
    soil_type, confidence_or_error = validate_and_predict_soil(filepath)
    
    if soil_type is None:
        print(json.dumps({"error": confidence_or_error}))
        sys.exit(0)
        
    details = SOIL_DETAILS.get(soil_type, {
        "characteristics": "Varied geological properties.",
        "retention": "Medium",
        "fertility": "Medium",
        "drainage": "Medium",
        "suitable": "Generic agricultural crops"
    })
    
    print(json.dumps({
        "soil": soil_type,
        "confidence": confidence_or_error,
        "characteristics": details["characteristics"],
        "retention": details["retention"],
        "fertility": details["fertility"],
        "drainage": details["drainage"],
        "suitable": details["suitable"]
    }))
