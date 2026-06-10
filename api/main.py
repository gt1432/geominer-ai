import os
import pandas as pd
import numpy as np
import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(
    title="AI Mineral Discovery Platform API",
    description="REST API to predict mineral potential score and identify likely mineral occurrences using machine learning.",
    version="1.0"
)

# Global variables to cache model and reference data
model = None
df_ngcm = None
df_geology = None
df_min_occ = None

# Percentiles for element enrichment check
element_thresholds = {}

class PredictionInput(BaseModel):
    latitude: float
    longitude: float
    fe: float  # Iron concentration
    cu: float  # Copper concentration
    zn: float  # Zinc concentration
    rock_type: str = "Granite"

class PredictionOutput(BaseModel):
    mineral_probability: float
    predicted_minerals: list[str]
    risk_level: str
    rock_type: str
    geological_unit: str
    lithology: str
    formation: str
    explanation: str

@app.on_event("startup")
def startup_event():
    global model, df_ngcm, df_geology, df_min_occ, element_thresholds
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    models_dir = os.path.join(base_dir, "models")
    data_dir = os.path.join(base_dir, "data")
    
    # 1. Load trained model
    model_path = os.path.join(models_dir, "best_model.pkl")
    if os.path.exists(model_path):
        model = joblib.load(model_path)
        print("Model loaded successfully.")
    else:
        print(f"Warning: Model not found at {model_path}. Predict endpoint will fail until trained.")
        
    # 2. Load preprocessed reference data
    ngcm_path = os.path.join(data_dir, "ngcm.csv")
    geology_path = os.path.join(data_dir, "geology.csv")
    min_occ_path = os.path.join(data_dir, "mineral_occurrence.csv")
    
    if os.path.exists(ngcm_path) and os.path.exists(geology_path) and os.path.exists(min_occ_path):
        df_ngcm = pd.read_csv(ngcm_path)
        df_geology = pd.read_csv(geology_path)
        df_min_occ = pd.read_csv(min_occ_path)
        print("Reference datasets loaded successfully.")
        
        # Precompute 70th percentiles for geochemical elements to identify enrichment
        geo_cols = [c for c in df_ngcm.columns if c.endswith('_ppm') or c.endswith('_ppb') or c.endswith('__') or c.endswith('_') or c.endswith('loi')]
        for col in geo_cols:
            element_thresholds[col] = df_ngcm[col].quantile(0.70)
    else:
        print("Warning: Reference data CSVs not found in data/ folder.")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Welcome to the AI Mineral Discovery Platform REST API. Use POST /predict to query coordinates."
    }

@app.post("/predict", response_model=PredictionOutput)
def predict(payload: PredictionInput):
    global model, df_ngcm, df_geology, df_min_occ, element_thresholds
    
    if model is None or df_ngcm is None:
        raise HTTPException(status_code=503, detail="Model or reference datasets not initialized.")
        
    # 1. Fast Spatial KNN search (K=1) to get background geochemistry of the area
    lat_in, lon_in = payload.latitude, payload.longitude
    
    # Euclidean distance to all reference points
    dists = np.sqrt((df_ngcm['latitude'] - lat_in)**2 + (df_ngcm['longitude'] - lon_in)**2)
    nearest_idx = dists.idxmin()
    
    # Copy nearest row as a baseline
    nearest_ngcm_row = df_ngcm.iloc[[nearest_idx]].copy()
    nearest_geo_row = df_geology.iloc[[nearest_idx]].copy()
    
    # Merge them to reconstruct features expected by preprocessor
    full_row = pd.merge(nearest_ngcm_row, nearest_geo_row, on=['latitude', 'longitude', 'geological_unit'])
    
    # Identify rock type at coordinates from geology dataset
    import shapefile
    
    def point_in_polygon(x, y, poly_points):
        n = len(poly_points)
        inside = False
        p1x, p1y = poly_points[0]
        for i in range(n + 1):
            p2x, p2y = poly_points[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        return inside

    db_rock_type = "Granite"
    db_lithology = "Granitic Gneiss"
    db_geo_unit = "Dharwar Craton"
    db_formation = "Unknown Formation"
    intersected = False

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    shp_path = os.path.join(base_dir, "data", "extracted", "25K", "lithology_25k_ngdr_20250224140917945", "lithology_25k_ngdr")
    if os.path.exists(shp_path + ".shp"):
        try:
            sf = shapefile.Reader(shp_path)
            shapes = sf.shapes()
            records = sf.records()
            
            matching_indices = []
            for i in range(len(shapes)):
                bbox = shapes[i].bbox
                if bbox[0] <= lon_in <= bbox[2] and bbox[1] <= lat_in <= bbox[3]:
                    area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                    matching_indices.append((area, i))
            
            # Sort by bounding box area (smallest first) to check specific features before huge backgrounds
            matching_indices.sort(key=lambda x: x[0])
            
            for area, i in matching_indices:
                shape = shapes[i]
                parts = list(shape.parts) + [len(shape.points)]
                for p in range(len(shape.parts)):
                    start = parts[p]
                    end = parts[p+1]
                    poly_points = shape.points[start:end]
                    if point_in_polygon(lon_in, lat_in, poly_points):
                        rec = records[i].as_dict()
                        db_rock_type = rec.get('lithologic', 'Granite')
                        db_lithology = rec.get('standard_l', 'Granitic Gneiss')
                        db_geo_unit = rec.get('major_mine', 'Dharwar Craton')
                        db_formation = rec.get('formation', 'Unknown Formation')
                        intersected = True
                        break
                if intersected:
                    break
        except Exception as ex:
            pass

    if not intersected:
        if not nearest_geo_row.empty:
            db_rock_type = str(nearest_geo_row['rock_type'].values[0]) if 'rock_type' in nearest_geo_row.columns and not pd.isna(nearest_geo_row['rock_type'].values[0]) else "Granite"
            db_lithology = str(nearest_geo_row['lithology_category'].values[0]) if 'lithology_category' in nearest_geo_row.columns and not pd.isna(nearest_geo_row['lithology_category'].values[0]) else "Granitic Gneiss"
            db_geo_unit = str(nearest_geo_row['geological_unit'].values[0]) if 'geological_unit' in nearest_geo_row.columns and not pd.isna(nearest_geo_row['geological_unit'].values[0]) else "Dharwar Craton"
            db_formation = str(nearest_geo_row['stratigraphy'].values[0]) if 'stratigraphy' in nearest_geo_row.columns and not pd.isna(nearest_geo_row['stratigraphy'].values[0]) else "Unknown Formation"

    # 2. Override baseline features with user-supplied values
    full_row['latitude'] = lat_in
    full_row['longitude'] = lon_in
    full_row['rock_type'] = db_rock_type
    
    # Map user input values to corresponding columns with appropriate scaling
    # fe is mapped to fe2o3__ (if > 100, we treat it as ppm and convert to oxide percent, e.g. 1200 ppm -> 0.17%)
    fe_val = payload.fe
    if fe_val > 100.0:
        fe2o3_val = fe_val * 1.43 / 10000.0
    else:
        fe2o3_val = fe_val
    full_row['fe2o3__'] = fe2o3_val
    
    full_row['cu_ppm'] = payload.cu
    full_row['zn_ppm'] = payload.zn
    
    # 3. Predict Mineral Potential Score
    features_cols = model.feature_names_in_
    X_input = full_row[features_cols]
    
    pred_score = float(model.predict(X_input)[0])
    # Clip probability between 0.0 and 1.0
    mineral_probability = float(np.clip(pred_score, 0.0, 1.0))
    
    # 4. Determine likely minerals present based on geochemical enrichment and regional geology
    PCTL = 0.60
    predicted_minerals = []

    # Helper: safe column read from full_row
    def safe_col(col, default=0.0):
        if col in full_row.columns:
            val = full_row[col].values[0]
            return float(val) if not pd.isna(val) else default
        return default

    # Primary user-override elements
    thresh_fe = df_ngcm['fe2o3__'].quantile(PCTL) if 'fe2o3__' in df_ngcm.columns else 5.0
    thresh_cu = df_ngcm['cu_ppm'].quantile(PCTL)  if 'cu_ppm'  in df_ngcm.columns else 25.0
    thresh_zn = df_ngcm['zn_ppm'].quantile(PCTL)  if 'zn_ppm'  in df_ngcm.columns else 55.0

    if fe2o3_val > thresh_fe: predicted_minerals.append("Iron")
    if payload.cu   > thresh_cu: predicted_minerals.append("Copper")
    if payload.zn   > thresh_zn: predicted_minerals.append("Zinc")

    # Extended element → mineral map from all NGCM columns
    element_to_mineral = {
        'au_ppb':  'Gold',
        'mno__':   'Manganese',
        'ni_ppm':  'Nickel',
        'cr_ppm':  'Chromium',
        'pb_ppm':  'Lead',
        'v_ppm':   'Vanadium',
        'co_ppm':  'Cobalt',
        'tio2__':  'Titanium',
        'mo_ppm':  'Molybdenum',
        'sn_ppm':  'Tin',
        'w_ppm':   'Tungsten',
        'ag_ppm':  'Silver',
        'as_ppm':  'Arsenic',
        'bi_ppm':  'Bismuth',
        'sb_ppm':  'Antimony',
        'ba_ppm':  'Barite',
        'u_ppm':   'Uranium',
        'th_ppm':  'Thorium',
        'nb_ppm':  'Niobium',
        'zr_ppm':  'Zirconium',
    }
    for col, min_name in element_to_mineral.items():
        if min_name not in predicted_minerals and col in df_ngcm.columns:
            val    = safe_col(col)
            thresh = df_ngcm[col].quantile(PCTL)
            if val > thresh:
                predicted_minerals.append(min_name)

    # Tight exact-coordinate check for occurrences (within 2 km representing local grid)
    dists_min        = np.sqrt((df_min_occ['y'] - lat_in)**2 + (df_min_occ['x'] - lon_in)**2) * 111.0
    near_min_indices = dists_min[dists_min <= 2.0].index
    if not near_min_indices.empty:
        for idx in near_min_indices:
            commodity = str(df_min_occ.loc[idx, 'commodity']).strip().title()
            if any(kw in commodity.lower() for kw in ['magnetite', 'banded ferruginous']):
                commodity = "Iron"
            if commodity and commodity not in predicted_minerals:
                predicted_minerals.append(commodity)

    # Ensure a fallback default list if empty and potential is high
    if not predicted_minerals and mineral_probability > 0.5:
        predicted_minerals = ["Iron", "Quartzite", "Clay"]

    def pct_for(min_name):
        mapping = {
            "Iron":      lambda: round(fe2o3_val, 4),
            "Copper":    lambda: round(payload.cu / 10000.0, 6),
            "Zinc":      lambda: round(payload.zn / 10000.0, 6),
            "Gold":      lambda: round(safe_col('au_ppb') / 1_000_000.0, 8),
            "Manganese": lambda: round(safe_col('mno__'), 4),
            "Nickel":    lambda: round(safe_col('ni_ppm') / 10000.0, 6),
            "Lead":      lambda: round(safe_col('pb_ppm') / 10000.0, 6),
            "Chromium":  lambda: round(safe_col('cr_ppm') / 10000.0, 6),
            "Vanadium":  lambda: round(safe_col('v_ppm')  / 10000.0, 6),
            "Cobalt":    lambda: round(safe_col('co_ppm') / 10000.0, 6),
            "Titanium":  lambda: round(safe_col('tio2__'), 4),
            "Molybdenum":lambda: round(safe_col('mo_ppm') / 10000.0, 6),
            "Tin":       lambda: round(safe_col('sn_ppm') / 10000.0, 6),
            "Tungsten":  lambda: round(safe_col('w_ppm')  / 10000.0, 6),
            "Silver":    lambda: round(safe_col('ag_ppm') / 10000.0, 8),
            "Arsenic":   lambda: round(safe_col('as_ppm') / 10000.0, 6),
            "Bismuth":   lambda: round(safe_col('bi_ppm') / 10000.0, 6),
            "Antimony":  lambda: round(safe_col('sb_ppm') / 10000.0, 6),
            "Barite":    lambda: round(safe_col('ba_ppm') / 10000.0, 6),
            "Uranium":   lambda: round(safe_col('u_ppm')  / 10000.0, 8),
            "Thorium":   lambda: round(safe_col('th_ppm') / 10000.0, 8),
            "Niobium":   lambda: round(safe_col('nb_ppm') / 10000.0, 6),
            "Zirconium": lambda: round(safe_col('zr_ppm') / 10000.0, 6),
            "Diamond":   lambda: 0.0001,
            "Quartzite": lambda: 65.0,
            "Clay":      lambda: 45.0,
        }
        fn = mapping.get(min_name)
        return fn() if fn else 1.5

    mineral_percentages = {m: pct_for(m) for m in predicted_minerals}
    predicted_minerals.sort(key=lambda m: mineral_percentages.get(m, 0), reverse=True)
    
    # 5. Determine risk level
    if mineral_probability >= 0.60:
        risk_level = "High"
    elif mineral_probability >= 0.20:
        risk_level = "Medium"
    else:
        risk_level = "Low"
        
    min_list = ", ".join(predicted_minerals[:3]).lower() if len(predicted_minerals) > 0 else "mineral"
    explanation = f"The selected coordinate lies within a {db_rock_type.lower()}-rich lithological zone of the {db_geo_unit}. Historical NGCM geochemical signatures and documented mineral occurrences indicate favorable conditions for {min_list} mineralization."

    return PredictionOutput(
        mineral_probability=round(mineral_probability, 3),
        predicted_minerals=predicted_minerals,
        risk_level=risk_level,
        rock_type=db_rock_type,
        geological_unit=db_geo_unit,
        lithology=db_lithology,
        formation=db_formation,
        explanation=explanation
    )
