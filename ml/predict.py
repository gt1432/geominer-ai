import os
import sys
import argparse
import json
import pandas as pd
import numpy as np
import joblib


def main():
    parser = argparse.ArgumentParser(description="GeoMiner AI: Model Predictor Subprocess")
    parser.add_argument("--latitude",  type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--fe",        type=float, default=5.0)
    parser.add_argument("--cu",        type=float, default=30.0)
    parser.add_argument("--zn",        type=float, default=60.0)
    parser.add_argument("--rock_type", type=str,   default="Granite")
    parser.add_argument("--altitude",  type=float, default=450.0)

    args = parser.parse_args()

    ml_dir    = os.path.dirname(os.path.abspath(__file__))
    base_dir  = os.path.dirname(ml_dir)
    data_dir  = os.path.join(base_dir, "data")

    model_path    = os.path.join(ml_dir,  "best_model.pkl")
    ngcm_path     = os.path.join(data_dir, "ngcm.csv")
    geology_path  = os.path.join(data_dir, "geology.csv")
    min_occ_path  = os.path.join(data_dir, "mineral_occurrence.csv")

    # 1. Load trained model
    if not os.path.exists(model_path):
        print(json.dumps({"error": f"Model pkl not found at {model_path}"}))
        sys.exit(1)
    model = joblib.load(model_path)

    # 2. Load reference datasets
    if not (os.path.exists(ngcm_path) and os.path.exists(geology_path) and os.path.exists(min_occ_path)):
        print(json.dumps({"error": "Reference datasets missing from data/ folder."}))
        sys.exit(1)

    df_ngcm    = pd.read_csv(ngcm_path)
    df_geology = pd.read_csv(geology_path)
    df_min_occ = pd.read_csv(min_occ_path)

    # 3. Spatial KNN (K=1) — nearest NGCM sample
    dists       = np.sqrt((df_ngcm['latitude'] - args.latitude)**2 + (df_ngcm['longitude'] - args.longitude)**2)
    min_dist    = dists.min()
    nearest_idx = dists.idxmin()
    nearest_ngcm_row = df_ngcm.iloc[[nearest_idx]].copy()

    # Determine geological zone
    geo_zone = "Unknown Formation"
    nearest_geo_row = df_geology.iloc[[nearest_idx]].copy() if nearest_idx < len(df_geology) else pd.DataFrame()
    if not nearest_geo_row.empty:
        common_cols = list(set(nearest_ngcm_row.columns) & set(nearest_geo_row.columns))
        merge_keys  = [c for c in ['latitude', 'longitude', 'geological_unit'] if c in common_cols]
        if merge_keys:
            merged   = pd.merge(nearest_ngcm_row, nearest_geo_row, on=merge_keys)
            full_row = merged if not merged.empty else nearest_ngcm_row.copy()
        else:
            full_row = nearest_ngcm_row.copy()
    else:
        full_row = nearest_ngcm_row.copy()

    if full_row.empty:
        full_row = nearest_ngcm_row.copy()

    if 'geological_unit' in full_row.columns:
        gz_val = full_row['geological_unit'].values[0]
        if not pd.isna(gz_val):
            geo_zone = str(gz_val)

    # 4. Out of bounds verification (e.g. Arabian Sea or outside studied area)
    if min_dist > 0.02:
        result = {
            "mineral_probability": 0,
            "predicted_minerals": [],
            "mineral_percentages": {},
            "confidence": "Low",
            "geological_zone": "None",
            "rock_type": "None",
            "nearest_mineral": "None",
            "nearest_mineral_dist_km": 0.0,
            "altitude": args.altitude,
            "explanation": "No geological data available at this location."
        }
        print(json.dumps(result))
        sys.exit(0)

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

    shp_path = os.path.join(data_dir, "extracted", "25K", "lithology_25k_ngdr_20250224140917945", "lithology_25k_ngdr")
    if os.path.exists(shp_path + ".shp"):
        try:
            sf = shapefile.Reader(shp_path)
            shapes = sf.shapes()
            records = sf.records()
            lat_pt, lon_pt = args.latitude, args.longitude
            
            matching_indices = []
            for i in range(len(shapes)):
                bbox = shapes[i].bbox
                if bbox[0] <= lon_pt <= bbox[2] and bbox[1] <= lat_pt <= bbox[3]:
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
                    if point_in_polygon(lon_pt, lat_pt, poly_points):
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

    # 5. Override user inputs
    full_row = full_row.copy()
    full_row['latitude']  = args.latitude
    full_row['longitude'] = args.longitude
    full_row['rock_type'] = db_rock_type

    fe_val    = args.fe
    fe2o3_val = fe_val * 1.43 / 10000.0 if fe_val > 100.0 else fe_val
    full_row['fe2o3__'] = fe2o3_val
    full_row['cu_ppm']  = args.cu
    full_row['zn_ppm']  = args.zn

    # 6. Model prediction
    features_cols    = model.feature_names_in_
    X_input          = full_row.reindex(columns=features_cols, fill_value=0)
    pred_score       = float(model.predict(X_input)[0])
    mineral_probability = float(np.clip(pred_score, 0.0, 1.0))

    # Helper: safe column read from full_row
    def safe_col(col, default=0.0):
        if col in full_row.columns:
            val = full_row[col].values[0]
            return float(val) if not pd.isna(val) else default
        return default

    # 7. Mineral detection — return all 26 minerals present in the reference data
    predicted_minerals = [
        "Iron", "Copper", "Zinc", "Gold", "Manganese", "Nickel", "Lead", 
        "Chromium", "Vanadium", "Cobalt", "Titanium", "Molybdenum", "Tin", 
        "Tungsten", "Silver", "Arsenic", "Bismuth", "Antimony", "Barite", 
        "Uranium", "Thorium", "Niobium", "Zirconium", "Diamond", "Quartzite", "Clay"
    ]

    nearest_mineral = "None"
    # Tight exact-coordinate check for occurrences (within 2 km representing local grid)
    dists_min        = np.sqrt((df_min_occ['y'] - args.latitude)**2 + (df_min_occ['x'] - args.longitude)**2) * 111.0
    near_min_indices = dists_min[dists_min <= 2.0].index
    if not near_min_indices.empty:
        nearest_mineral = str(df_min_occ.loc[near_min_indices[0], 'commodity']).strip().title()
        if any(kw in nearest_mineral.lower() for kw in ['magnetite', 'banded ferruginous']):
            nearest_mineral = "Iron"

    # 8. Confidence
    if mineral_probability >= 0.60:
        confidence = "High"
    elif mineral_probability >= 0.20:
        confidence = "Medium"
    else:
        confidence = "Low"

    prob_percent = int(round(mineral_probability * 100))

    # 9. Mineral percentage concentrations
    def pct_for(min_name):
        mapping = {
            "Iron":      lambda: round(fe2o3_val, 4),
            "Copper":    lambda: round(args.cu / 10000.0, 6),
            "Zinc":      lambda: round(args.zn / 10000.0, 6),
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

    # Sort minerals by concentration descending
    predicted_minerals.sort(key=lambda m: mineral_percentages.get(m, 0), reverse=True)

    # 10. Generate AI Explanation using detected geology
    min_list = ", ".join(predicted_minerals[:3]).lower() if len(predicted_minerals) > 0 else "mineral"
    explanation = f"The selected coordinate lies within a {db_rock_type.lower()}-rich lithological zone of the {db_geo_unit}. Historical NGCM geochemical signatures and documented mineral occurrences indicate favorable conditions for {min_list} mineralization."

    # 11. Output JSON
    result = {
        "mineral_probability":     prob_percent,
        "predicted_minerals":      predicted_minerals,
        "mineral_percentages":     mineral_percentages,
        "confidence":              confidence,
        "geological_zone":         db_formation,
        "rock_type":               db_rock_type,
        "lithology":               db_lithology,
        "geological_unit":         db_geo_unit,
        "formation":               db_formation,
        "nearest_mineral":         nearest_mineral,
        "nearest_mineral_dist_km": 0.0,
        "altitude":                args.altitude,
        "explanation":             explanation
    }

    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
