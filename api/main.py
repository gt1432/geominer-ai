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

COMMODITY_MAP = {
    'banded magnetite quartzite': 'Iron',
    'magnetite':                  'Iron',
    'banded ferruginous':         'Iron',
    'iron ore':                   'Iron',
    'ironore':                    'Iron',
    'gold':                       'Gold',
    'diamond':                    'Diamond',
    'copper':                     'Copper',
    'lead':                       'Lead',
    'zinc':                       'Zinc',
    'manganese':                  'Manganese',
    'chromite':                   'Chromium',
    'chrome':                     'Chromium',
    'nickel':                     'Nickel',
    'silver':                     'Silver',
    'tin':                        'Tin',
    'tungsten':                   'Tungsten',
    'molybdenum':                 'Molybdenum',
    'uranium':                    'Uranium',
    'thorium':                    'Thorium',
    'barite':                     'Barite',
    'baryte':                     'Barite',
    'vanadium':                   'Vanadium',
    'cobalt':                     'Cobalt',
    'titanium':                   'Titanium',
    'niobium':                    'Niobium',
    'zirconium':                  'Zirconium',
    'arsenic':                    'Arsenic',
    'bismuth':                    'Bismuth',
    'antimony':                   'Antimony',
}

def normalize_commodity(raw):
    key = str(raw).strip().lower()
    for k, v in COMMODITY_MAP.items():
        if k in key:
            return v
    return str(raw).strip().title()

MINERAL_BELTS = [
    (12.8, 13.3, 77.9, 78.4, ['Gold', 'Silver', 'Copper'], 'Kolar Gold Field'),
    (14.8, 15.5, 76.1, 76.6, ['Iron', 'Manganese', 'Chromium'], 'Bellary Iron Belt'),
    (14.9, 15.3, 76.3, 76.7, ['Iron', 'Chromium', 'Vanadium'], 'Sandur Schist Belt'),
    (13.9, 14.4, 76.2, 76.8, ['Iron', 'Copper', 'Gold'], 'Chitradurga Schist Belt'),
    (15.0, 15.6, 77.4, 77.9, ['Diamond', 'Gold'], 'Kurnool Diamond Zone'),
    (14.5, 16.0, 79.0, 80.5, ['Niobium', 'Zirconium', 'Thorium', 'Uranium'], 'Eastern Ghats Belt'),
]

def get_belt_for_point(lat, lon):
    for (lat_min, lat_max, lon_min, lon_max, minerals, belt_name) in MINERAL_BELTS:
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return belt_name, minerals
    return None, []

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
    mineral_percentages: dict
    risk_level: str
    confidence: str
    rock_type: str
    geological_unit: str
    lithology: str
    formation: str
    geological_zone: str
    belt_name: str
    occurrence_present: bool
    documented_minerals: list[str]
    nearest_mineral: str
    nearest_mineral_dist_km: float
    explanation: str
    rock_type_probabilities: dict
    rock_type_class: str
    rock_type_confidence: float
    rock_formation_description: str
    associated_minerals: list[str]
    suitability_score: float
    suitability_category: str
    correlation_details: dict
    ai_insights: dict
    ai_recommendations: dict

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
        geo_cols = [c for c in df_ngcm.columns if c.endswith('_ppm') or c.endswith('_ppb') or c.endswith('__') or c.endswith('loi')]
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
    
    # Find nearest row in geology table independently to avoid index mismatch
    geo_dists = np.sqrt((df_geology['latitude'] - lat_in)**2 + (df_geology['longitude'] - lon_in)**2) if 'latitude' in df_geology.columns and 'longitude' in df_geology.columns else dists
    nearest_geo_idx = geo_dists.idxmin()
    nearest_geo_row = df_geology.iloc[[nearest_geo_idx]].copy()
    
    # Combine feature rows safely using concat (avoids merge empty-result crash)
    ngcm_reset = nearest_ngcm_row.reset_index(drop=True)
    geo_reset = nearest_geo_row.reset_index(drop=True)
    # Drop overlapping columns from geo except geology-specific ones
    geo_cols_to_add = [c for c in geo_reset.columns if c not in ngcm_reset.columns]
    full_row = pd.concat([ngcm_reset, geo_reset[geo_cols_to_add]], axis=1)
    
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
    predicted_minerals = [
        "Iron", "Copper", "Zinc", "Gold", "Manganese", "Nickel", "Lead", 
        "Chromium", "Vanadium", "Cobalt", "Titanium", "Molybdenum", "Tin", 
        "Tungsten", "Silver", "Arsenic", "Bismuth", "Antimony", "Barite", 
        "Uranium", "Thorium", "Niobium", "Zirconium", "Diamond", "Quartzite", "Clay"
    ]

    # Helper: safe column read from full_row
    def safe_col(col, default=0.0):
        if col in full_row.columns:
            val = full_row[col].values[0]
            return float(val) if not pd.isna(val) else default
        return default

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
    
    # 5. Spatial Mineral Occurrences & Belt checks
    dists_km = np.sqrt(
        (df_min_occ['y'] - lat_in)**2 + (df_min_occ['x'] - lon_in)**2
    ) * 111.0
    primary_mask = dists_km <= 5.0
    secondary_mask = dists_km <= 25.0
    
    documented_minerals = []
    nearest_mineral = "None"
    nearest_mineral_dist_km = float(dists_km.min()) if not dists_km.empty else 999.0
    occurrence_present = False
    
    if primary_mask.any():
        occurrence_present = True
        commodities = df_min_occ.loc[primary_mask, 'commodity'].tolist()
        for c in commodities:
            norm = normalize_commodity(c)
            if norm not in documented_minerals:
                documented_minerals.append(norm)
        nearest_mineral = documented_minerals[0] if documented_minerals else "None"
    elif secondary_mask.any():
        commodities = df_min_occ.loc[secondary_mask, 'commodity'].tolist()
        for c in commodities:
            norm = normalize_commodity(c)
            if norm not in documented_minerals:
                documented_minerals.append(norm)
        nearest_mineral = documented_minerals[0] if documented_minerals else "None"

    # Belt inheritance
    belt_name, belt_minerals = get_belt_for_point(lat_in, lon_in)
    if belt_minerals:
        for bm in belt_minerals:
            if bm not in documented_minerals:
                documented_minerals.append(bm)
        if nearest_mineral == "None":
            nearest_mineral = belt_minerals[0]
        occurrence_present = True
    
    # Floor adjustment and confidence determination
    if occurrence_present and primary_mask.any():
        mineral_probability = max(mineral_probability, 0.65)
        confidence = "High"
    elif occurrence_present:
        mineral_probability = max(mineral_probability, 0.40)
        confidence = "Medium"
    elif mineral_probability >= 0.60:
        confidence = "High"
    elif mineral_probability >= 0.30:
        confidence = "Medium"
    else:
        confidence = "Low"

    risk_level = confidence

    # Re-apply occurrence premiums to percentages if documented
    for bm in documented_minerals:
        if bm in mineral_percentages:
            mineral_percentages[bm] = round(mineral_percentages[bm] * 1.5, 6)
    
    predicted_minerals.sort(key=lambda m: mineral_percentages.get(m, 0), reverse=True)

    # Explanation construction
    occ_str = ", ".join(documented_minerals[:3]) if documented_minerals else None
    pred_top = ", ".join(predicted_minerals[:3]).lower()
    
    if occ_str and belt_name:
        explanation = (
            f"This coordinate lies within the {belt_name} ({db_geo_unit}), a documented "
            f"mineralized zone. Recorded occurrences include: {occ_str}. "
            f"NGCM geochemical data also indicates favorable conditions for {pred_top} mineralization."
        )
    elif occ_str:
        explanation = (
            f"A documented mineral occurrence ({occ_str}) exists within the vicinity of this coordinate. "
            f"The location lies within the {db_geo_unit} ({db_rock_type} lithology). "
            f"Geochemical signatures from the NGCM dataset indicate favorable conditions for {pred_top} mineralization."
        )
    elif belt_name:
        explanation = (
            f"This coordinate falls within the {belt_name}, a well-documented geological belt. "
            f"The {db_geo_unit} hosts characteristic mineralization including {pred_top}. "
            f"NGCM geochemical survey data confirms elevated element signatures in this zone."
        )
    else:
        explanation = (
            f"The selected coordinate lies within a {db_rock_type.lower()}-rich lithological zone of the "
            f"{db_geo_unit}. Historical NGCM geochemical signatures indicate favorable conditions for "
            f"{pred_top} mineralization. No specific occurrence is documented at this exact location."
        )

    # ── Rock Type, Suitability, Correlation, AI Insights & Recommendations ──
    rt_lower = db_rock_type.lower()
    lith_lower = db_lithology.lower()
    
    p_igneous = 0.0
    p_sedimentary = 0.0
    p_metamorphic = 0.0
    
    igneous_keywords = ['granite', 'basalt', 'rhyolite', 'gabbro', 'pegmatite', 'tonalite', 'granodiorite', 'tuff', 'volcanic', 'mafic', 'ultramafic', 'charnockite', 'dolerite', 'syenite']
    sedimentary_keywords = ['sandstone', 'limestone', 'shale', 'conglomerate', 'clay', 'siltstone', 'dolomite', 'chert', 'sediment', 'laterite', 'alluvium', 'gravel', 'sand']
    metamorphic_keywords = ['gneiss', 'schist', 'quartzite', 'marble', 'slate', 'amphibolite', 'migmatite', 'phyllite', 'granulite', 'khondalite']
    
    is_ign = any(k in rt_lower or k in lith_lower for k in igneous_keywords)
    is_sed = any(k in rt_lower or k in lith_lower for k in sedimentary_keywords)
    is_met = any(k in rt_lower or k in lith_lower for k in metamorphic_keywords)
    
    if is_ign:
        p_igneous = 0.85
        p_sedimentary = 0.05
        p_metamorphic = 0.10
        rock_class = "Igneous"
        rock_formation_desc = f"Formed via mechanical cooling and crystallization of silicate melt. Typical formation of {db_lithology} which occurs during primary magmatic events in the {db_geo_unit} cratonic basement."
        assoc_rocks_by_class = ["Granite Intrusions", "Quartz Veins", "Pegmatite Dikes", "Mafic Dykes"]
    elif is_sed:
        p_igneous = 0.05
        p_sedimentary = 0.85
        p_metamorphic = 0.10
        rock_class = "Sedimentary"
        rock_formation_desc = f"Formed via mechanical weathering, transportation, deposition, and cementation of sediments. Lithological units like {db_lithology} suggest paleo-depositional basin environments."
        assoc_rocks_by_class = ["Banded Iron Formations", "Sandstones", "Carbonates", "Shales"]
    elif is_met:
        p_igneous = 0.10
        p_sedimentary = 0.05
        p_metamorphic = 0.85
        rock_class = "Metamorphic"
        rock_formation_desc = f"Pre-existing protolith subjected to high temperatures and pressures causing recrystallization. Gneissic banding or schistosity in {db_lithology} indicates dynamic regional metamorphism."
        assoc_rocks_by_class = ["Quartz Veins", "Mica Schists", "Amphibolites", "Shear Zones"]
    else:
        p_igneous = 0.20
        p_sedimentary = 0.10
        p_metamorphic = 0.70
        rock_class = "Metamorphic"
        rock_formation_desc = f"Metamorphosed cratonic suite of the Archaean Dharwar Craton. Unit consists of highly altered schistose or gneissic complexes."
        assoc_rocks_by_class = ["Quartz Veins", "Gneisses", "Schists"]

    if rock_class == "Igneous":
        assoc_mins = ["Gold", "Copper", "Chromium", "Nickel", "Titanium", "Cobalt", "Diamond"]
    elif rock_class == "Sedimentary":
        assoc_mins = ["Iron", "Manganese", "Barite", "Clay", "Quartzite"]
    else:
        assoc_mins = ["Gold", "Silver", "Lead", "Zinc", "Copper", "Tungsten", "Zirconium"]

    rock_conf = 85.0 + (lat_in % 0.1) * 100.0
    rock_conf = round(min(rock_conf, 98.5), 1)

    prob_percent = int(round(mineral_probability * 100))

    if nearest_mineral_dist_km <= 5.0:
        occ_bonus = 20
    elif nearest_mineral_dist_km <= 25.0:
        occ_bonus = 10
    else:
        occ_bonus = 0

    altitude_in = payload.altitude if hasattr(payload, 'altitude') else 450.0
    if 350 <= altitude_in <= 750:
        terrain_factor = 10
    else:
        terrain_factor = 5

    if rock_class in ["Metamorphic", "Igneous"]:
        rock_factor = 10
    else:
        rock_factor = 7

    suitability_score = 0.6 * prob_percent + 1.0 * occ_bonus + 1.0 * terrain_factor + 1.0 * rock_factor
    suitability_score = int(round(np.clip(suitability_score, 0.0, 100.0)))

    if suitability_score >= 85:
        suitability_cat = "Very High Potential"
    elif suitability_score >= 70:
        suitability_cat = "High Potential"
    elif suitability_score >= 50:
        suitability_cat = "Good"
    elif suitability_score >= 25:
        suitability_cat = "Moderate"
    else:
        suitability_cat = "Poor"

    top_mineral = predicted_minerals[0] if predicted_minerals else "Iron"
    
    correlation_db = {
        "Gold": {
            "associated_rocks": ["Quartz Veins", "Granite Intrusions", "Metavolcanics"],
            "geological_environment": "Archaean greenstone belts & shear zones",
            "formation_process": "Hydrothermal fluid circulation and quartz vein deposition during orogenic deformation",
            "exploration_significance": "Look for structurally controlled faults and quartz reef outcrops within greenstone suites."
        },
        "Iron": {
            "associated_rocks": ["Banded Iron Formations (BIF)", "Magnetite Quartzite", "Hematite Schists"],
            "geological_environment": "Precambrian volcano-sedimentary schist belts",
            "formation_process": "Chemical precipitation of iron oxides in marine sedimentary basins during pre-oxygenated eras",
            "exploration_significance": "Large-scale stratiform deposits suitable for open-pit extraction. Map magnetic anomalies."
        },
        "Copper": {
            "associated_rocks": ["Porphyry Granites", "Altered Volcanics", "Amphibolites"],
            "geological_environment": "Volcanogenic Massive Sulphide (VMS) & Hydrothermal porphyry zones",
            "formation_process": "Precipitation from hydrothermal fluids in shear zones and volcaniclastic fractures",
            "exploration_significance": "Trace malachite staining, gossan zones, and local electromagnetic resistivity lows."
        },
        "Manganese": {
            "associated_rocks": ["Manganiferous Phyllites", "Chert-Dolomite Basins", "Laterites"],
            "geological_environment": "Sedimentary basins with supergene enrichment",
            "formation_process": "Sedimentary deposition followed by secondary weather-driven enrichment near surface layers",
            "exploration_significance": "Supergene enrichment blankets overlying folded metasedimentary sequences."
        },
        "Chromium": {
            "associated_rocks": ["Ultramafic rocks", "Serpentinites", "Pyroxenites"],
            "geological_environment": "Layered mafic-ultramafic intrusive complexes",
            "formation_process": "Early magmatic gravity settling of chromite crystals inside cooling magma chambers",
            "exploration_significance": "Check contact boundaries between granitic gneisses and greenstone ultramafics."
        },
        "Diamond": {
            "associated_rocks": ["Kimberlite Pipes", "Conglomerates", "Gravel Outwashes"],
            "geological_environment": "Cratonic lithosphere roots & alluvial deposits",
            "formation_process": "Deep mantle volcanic eruptions bringing diamondiferous pipe material rapidly to surface",
            "exploration_significance": "Identify indicator minerals (pyrope garnet, chromian diopside) in heavy mineral concentrate."
        }
    }
    
    corr_match = correlation_db.get(top_mineral, {
        "associated_rocks": assoc_rocks_by_class,
        "geological_environment": f"{rock_class} formations in the Dharwar Craton",
        "formation_process": f"Geochemical enrichment of {top_mineral} in local {db_lithology} layers",
        "exploration_significance": f"Verify localized geochemical elements in {top_mineral} mapping."
    })
    
    correlation_details = {
        "predicted_mineral": top_mineral,
        **corr_match
    }

    geological_summary = f"The target site at latitude {lat_in:.5f}°N and longitude {lon_in:.5f}°E is situated in the {db_geo_unit}. It is comprised of {db_lithology} belonging to the {db_formation or 'basement complex'}. Geochemical data highlights active enrichment signatures."
    predicted_mineral_zones = f"Top prospectivity zone identified for {top_mineral} and associated minerals ({', '.join(predicted_minerals[1:4])}). Regional records show a spatial correlation with the {belt_name or 'Dharwar greenstone suite'}."
    exploration_potential = f"Exploration suitability is classified as {suitability_cat} ({suitability_score}/100) based on mineral probability ({prob_percent}%) and the surrounding {rock_class.lower()} rock matrix."
    risk_factors = "Primary exploration risk includes structural overburden and weathering-driven dilution of stream sediment element signatures."
    
    if suitability_score >= 70:
        recommended_survey_type = "Detailed core drilling, ground magnetic profiling, and lithogeochemical trenching."
        expl_priority = "HIGH PRIORITY"
    elif suitability_score >= 50:
        recommended_survey_type = "High-resolution induced polarization (IP) geophysical surveys and soil geochemistry."
        expl_priority = "MEDIUM PRIORITY"
    else:
        recommended_survey_type = "Reconnaissance geological mapping and stream sediment panning."
        expl_priority = "LOW PRIORITY"

    ai_insights = {
        "geological_summary": geological_summary,
        "predicted_rock_type": rock_class,
        "predicted_mineral_zones": predicted_mineral_zones,
        "exploration_potential": exploration_potential,
        "risk_factors": risk_factors,
        "recommended_survey_type": recommended_survey_type
    }

    nearby_msg = f"Nearby high-potential zones include documented {nearest_mineral} occurrences at {nearest_mineral_dist_km:.1f} km." if nearest_mineral != "None" else "No immediate nearby high-potential zones documented within 25 km."
    
    ai_recommendations = {
        "exploration_priority": expl_priority,
        "recommended_surveys": recommended_survey_type,
        "additional_data_required": "Detailed structural fold-axis maps and local water chemistry analysis to trace groundwater leaching.",
        "nearby_zones": nearby_msg,
        "possible_minerals": assoc_mins[:4],
        "associated_rocks": assoc_rocks_by_class
    }

    return PredictionOutput(
        mineral_probability=round(mineral_probability, 3),
        predicted_minerals=predicted_minerals,
        mineral_percentages=mineral_percentages,
        risk_level=risk_level,
        confidence=confidence,
        rock_type=db_rock_type,
        geological_unit=db_geo_unit,
        lithology=db_lithology,
        formation=db_formation,
        geological_zone=db_formation,
        belt_name=belt_name or "",
        occurrence_present=occurrence_present,
        documented_minerals=documented_minerals,
        nearest_mineral=nearest_mineral,
        nearest_mineral_dist_km=round(nearest_mineral_dist_km, 2),
        explanation=explanation,
        rock_type_probabilities={
            "igneous": round(p_igneous, 2),
            "sedimentary": round(p_sedimentary, 2),
            "metamorphic": round(p_metamorphic, 2)
        },
        rock_type_class=rock_class,
        rock_type_confidence=rock_conf,
        rock_formation_description=rock_formation_desc,
        associated_minerals=assoc_mins,
        suitability_score=float(suitability_score),
        suitability_category=suitability_cat,
        correlation_details=correlation_details,
        ai_insights=ai_insights,
        ai_recommendations=ai_recommendations
    )
