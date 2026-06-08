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
    nearest_idx = dists.idxmin()
    nearest_ngcm_row = df_ngcm.iloc[[nearest_idx]].copy()

    # Merge geology safely
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

    # 4. Override user inputs
    full_row = full_row.copy()
    full_row['latitude']  = args.latitude
    full_row['longitude'] = args.longitude
    full_row['rock_type'] = args.rock_type

    fe_val    = args.fe
    fe2o3_val = fe_val * 1.43 / 10000.0 if fe_val > 100.0 else fe_val
    full_row['fe2o3__'] = fe2o3_val
    full_row['cu_ppm']  = args.cu
    full_row['zn_ppm']  = args.zn

    # 5. Model prediction
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

    # 6. Mineral detection — 60th percentile threshold, all NGCM elements
    PCTL = 0.60
    predicted_minerals = []

    # Primary user-override elements
    thresh_fe = df_ngcm['fe2o3__'].quantile(PCTL) if 'fe2o3__' in df_ngcm.columns else 5.0
    thresh_cu = df_ngcm['cu_ppm'].quantile(PCTL)  if 'cu_ppm'  in df_ngcm.columns else 25.0
    thresh_zn = df_ngcm['zn_ppm'].quantile(PCTL)  if 'zn_ppm'  in df_ngcm.columns else 55.0

    if fe2o3_val > thresh_fe: predicted_minerals.append("Iron")
    if args.cu   > thresh_cu: predicted_minerals.append("Copper")
    if args.zn   > thresh_zn: predicted_minerals.append("Zinc")

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

    # Known mineral occurrences within 25 km radius
    dists_min        = np.sqrt((df_min_occ['y'] - args.latitude)**2 + (df_min_occ['x'] - args.longitude)**2) * 111.0
    near_min_indices = dists_min[dists_min <= 25.0].index
    if not near_min_indices.empty:
        for idx in near_min_indices:
            commodity = str(df_min_occ.loc[idx, 'commodity']).strip().title()
            if any(kw in commodity.lower() for kw in ['magnetite', 'banded ferruginous']):
                commodity = "Iron"
            if commodity and commodity not in predicted_minerals:
                predicted_minerals.append(commodity)

    if not predicted_minerals:
        predicted_minerals = ["Quartzite" if mineral_probability > 0.4 else "Clay"]

    # 7. Confidence
    if mineral_probability >= 0.60:
        confidence = "High"
    elif mineral_probability >= 0.20:
        confidence = "Medium"
    else:
        confidence = "Low"

    prob_percent = int(round(mineral_probability * 100))

    # 8. Mineral percentage concentrations
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

    # 9. Geological zone
    geo_zone = "Unknown Formation"
    if 'geological_unit' in full_row.columns:
        gz_val = full_row['geological_unit'].values[0]
        if not pd.isna(gz_val):
            geo_zone = str(gz_val)

    # 10. Output JSON
    result = {
        "mineral_probability":     prob_percent,
        "predicted_minerals":      predicted_minerals,
        "mineral_percentages":     mineral_percentages,
        "confidence":              confidence,
        "geological_zone":         geo_zone,
        "rock_type":               str(full_row['rock_type'].values[0]) if 'rock_type' in full_row.columns else args.rock_type,
        "nearest_mineral":         str(df_min_occ.loc[dists_min.idxmin(), 'commodity']),
        "nearest_mineral_dist_km": float(dists_min.min()),
        "altitude":                args.altitude,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
