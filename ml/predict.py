import os
import sys
import argparse
import json
import pandas as pd
import numpy as np
import joblib

def main():
    parser = argparse.ArgumentParser(description="GeoMiner AI: Model Predictor Subprocess")
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--fe", type=float, default=5.0)
    parser.add_argument("--cu", type=float, default=30.0)
    parser.add_argument("--zn", type=float, default=60.0)
    parser.add_argument("--rock_type", type=str, default="Granite")
    parser.add_argument("--altitude", type=float, default=450.0)
    
    args = parser.parse_args()
    
    ml_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(ml_dir)
    data_dir = os.path.join(base_dir, "data")
    
    model_path = os.path.join(ml_dir, "best_model.pkl")
    ngcm_path = os.path.join(data_dir, "ngcm.csv")
    geology_path = os.path.join(data_dir, "geology.csv")
    min_occ_path = os.path.join(data_dir, "mineral_occurrence.csv")
    
    # 1. Load trained model pipeline
    if not os.path.exists(model_path):
        print(json.dumps({"error": f"Model pkl file not found at {model_path}"}))
        sys.exit(1)
    model = joblib.load(model_path)
    
    # 2. Load reference data
    if not (os.path.exists(ngcm_path) and os.path.exists(geology_path) and os.path.exists(min_occ_path)):
        print(json.dumps({"error": "Reference datasets missing from data/ folder."}))
        sys.exit(1)
        
    df_ngcm = pd.read_csv(ngcm_path)
    df_geology = pd.read_csv(geology_path)
    df_min_occ = pd.read_csv(min_occ_path)
    
    # 3. Spatial KNN search (K=1) to retrieve local background geochemistry
    dists = np.sqrt((df_ngcm['latitude'] - args.latitude)**2 + (df_ngcm['longitude'] - args.longitude)**2)
    nearest_idx = dists.idxmin()
    
    nearest_ngcm_row = df_ngcm.iloc[[nearest_idx]].copy()
    
    # BUG FIX: pd.merge can produce empty DataFrame if geology row doesn't match.
    # Use positional iloc lookup on geology instead of merge to guarantee non-empty result.
    nearest_geo_row = df_geology.iloc[[nearest_idx]].copy() if nearest_idx < len(df_geology) else pd.DataFrame()
    
    if not nearest_geo_row.empty:
        # Only merge on common columns that actually exist in both frames
        common_cols = list(set(nearest_ngcm_row.columns) & set(nearest_geo_row.columns))
        merge_keys = [c for c in ['latitude', 'longitude', 'geological_unit'] if c in common_cols]
        if merge_keys:
            merged = pd.merge(nearest_ngcm_row, nearest_geo_row, on=merge_keys)
            full_row = merged if not merged.empty else nearest_ngcm_row.copy()
        else:
            full_row = nearest_ngcm_row.copy()
    else:
        full_row = nearest_ngcm_row.copy()
    
    # Ensure full_row is not empty (absolute fallback)
    if full_row.empty:
        full_row = nearest_ngcm_row.copy()
    
    # 4. Override user-input features
    full_row = full_row.copy()
    full_row['latitude'] = args.latitude
    full_row['longitude'] = args.longitude
    full_row['rock_type'] = args.rock_type
    
    # Apply Fe scaling (Fe oxide % in dataset vs Fe ppm in input)
    fe_val = args.fe
    if fe_val > 100.0:
        fe2o3_val = fe_val * 1.43 / 10000.0
    else:
        fe2o3_val = fe_val
    full_row['fe2o3__'] = fe2o3_val
    full_row['cu_ppm'] = args.cu
    full_row['zn_ppm'] = args.zn
    
    # 5. Model Prediction
    features_cols = model.feature_names_in_
    # BUG FIX: Use reindex to fill any missing columns with 0 instead of crashing with KeyError
    X_input = full_row.reindex(columns=features_cols, fill_value=0)
    
    pred_score = float(model.predict(X_input)[0])
    mineral_probability = float(np.clip(pred_score, 0.0, 1.0))
    
    # BUG FIX: Helper to safely read a column value from full_row with fallback
    def safe_col(col, default=0.0):
        if col in full_row.columns:
            val = full_row[col].values[0]
            if pd.isna(val):
                return default
            return float(val)
        return default
    
    # 6. Analyze element enrichment and compile likely minerals
    predicted_minerals = []
    
    # Thresholds (70th percentile of elements in dataset)
    thresh_fe = df_ngcm['fe2o3__'].quantile(0.70) if 'fe2o3__' in df_ngcm.columns else 5.0
    thresh_cu = df_ngcm['cu_ppm'].quantile(0.70) if 'cu_ppm' in df_ngcm.columns else 30.0
    thresh_zn = df_ngcm['zn_ppm'].quantile(0.70) if 'zn_ppm' in df_ngcm.columns else 60.0
    
    if fe2o3_val > thresh_fe: predicted_minerals.append("Iron")
    if args.cu > thresh_cu: predicted_minerals.append("Copper")
    if args.zn > thresh_zn: predicted_minerals.append("Zinc")
    
    # Query other indicators in regional background
    element_to_mineral = {
        'au_ppb': 'Gold',
        'mno__': 'Manganese',
        'ni_ppm': 'Nickel',
        'cr_ppm': 'Chromium',
        'pb_ppm': 'Lead'
    }
    for col, min_name in element_to_mineral.items():
        if min_name not in predicted_minerals:
            if col in df_ngcm.columns:
                val = safe_col(col)
                thresh = df_ngcm[col].quantile(0.70)
                if val > thresh:
                    predicted_minerals.append(min_name)
                
    # Query nearest mineral occurrences within 15 km
    dists_min = np.sqrt((df_min_occ['y'] - args.latitude)**2 + (df_min_occ['x'] - args.longitude)**2) * 111.0
    near_min_indices = dists_min[dists_min <= 15.0].index
    if not near_min_indices.empty:
        for idx in near_min_indices:
            # BUG FIX: Use title() for proper casing, not capitalize() which lowercases rest
            commodity = str(df_min_occ.loc[idx, 'commodity']).strip().title()
            # Normalize common names
            if any(kw in commodity.lower() for kw in ['magnetite', 'banded ferruginous']):
                commodity = "Iron"
            if commodity and commodity not in predicted_minerals:
                predicted_minerals.append(commodity)
                
    if not predicted_minerals:
        predicted_minerals = ["Quartzite" if mineral_probability > 0.4 else "Clay"]
        
    predicted_minerals.sort()
    predicted_minerals = predicted_minerals[:3]
    
    # 7. Confidence categorisation
    if mineral_probability >= 0.60:
        confidence = "High"
    elif mineral_probability >= 0.20:
        confidence = "Medium"
    else:
        confidence = "Low"
        
    # Map probability to percent
    prob_percent = int(round(mineral_probability * 100))
    
    # 7.5 Calculate mineral percentages
    mineral_percentages = {}
    for min_name in predicted_minerals:
        if min_name == "Iron":
            mineral_percentages[min_name] = round(fe2o3_val, 4)
        elif min_name == "Copper":
            mineral_percentages[min_name] = round(args.cu / 10000.0, 6)
        elif min_name == "Zinc":
            mineral_percentages[min_name] = round(args.zn / 10000.0, 6)
        elif min_name == "Gold":
            mineral_percentages[min_name] = round(safe_col('au_ppb') / 1000000.0, 8)
        elif min_name == "Manganese":
            mineral_percentages[min_name] = round(safe_col('mno__'), 4)
        elif min_name == "Nickel":
            mineral_percentages[min_name] = round(safe_col('ni_ppm') / 10000.0, 6)
        elif min_name == "Lead":
            mineral_percentages[min_name] = round(safe_col('pb_ppm') / 10000.0, 6)
        elif min_name == "Chromium":
            mineral_percentages[min_name] = round(safe_col('cr_ppm') / 10000.0, 6)
        elif min_name == "Quartzite":
            mineral_percentages[min_name] = 65.0
        elif min_name == "Clay":
            mineral_percentages[min_name] = 45.0
        else:
            mineral_percentages[min_name] = 1.5
            
    # 8. Determine geological zone safely
    geo_zone = "Unknown Formation"
    if 'geological_unit' in full_row.columns:
        gz_val = full_row['geological_unit'].values[0]
        if not pd.isna(gz_val):
            geo_zone = str(gz_val)
            
    # 9. Output JSON to stdout
    result = {
        "mineral_probability": prob_percent,
        "predicted_minerals": predicted_minerals,
        "mineral_percentages": mineral_percentages,
        "confidence": confidence,
        "geological_zone": geo_zone,
        "rock_type": str(full_row['rock_type'].values[0]) if 'rock_type' in full_row.columns else args.rock_type,
        "nearest_mineral": str(df_min_occ.loc[dists_min.idxmin(), 'commodity']),
        "nearest_mineral_dist_km": float(dists_min.min()),
        "altitude": args.altitude
    }
    
    print(json.dumps(result))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Catch-all: always return JSON so Node.js can parse the error cleanly
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
