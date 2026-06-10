import os
import sys
import argparse
import json
import pandas as pd
import numpy as np
import joblib


# ─── Commodity name normalization ───────────────────────────────────────────
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
    """Map raw commodity string to canonical mineral name."""
    key = str(raw).strip().lower()
    for k, v in COMMODITY_MAP.items():
        if k in key:
            return v
    return str(raw).strip().title()


# ─── Known mineral belts (lat_min, lat_max, lon_min, lon_max, minerals, belt_name) ───
MINERAL_BELTS = [
    # Kolar Gold Field
    (12.8, 13.3, 77.9, 78.4, ['Gold', 'Silver', 'Copper'], 'Kolar Gold Field'),
    # Bellary / Hospet Iron Belt
    (14.8, 15.5, 76.1, 76.6, ['Iron', 'Manganese', 'Chromium'], 'Bellary Iron Belt'),
    # Sandur Schist Belt
    (14.9, 15.3, 76.3, 76.7, ['Iron', 'Chromium', 'Vanadium'], 'Sandur Schist Belt'),
    # Chitradurga Belt
    (13.9, 14.4, 76.2, 76.8, ['Iron', 'Copper', 'Gold'], 'Chitradurga Schist Belt'),
    # Kurnool diamond zone (Andhra Pradesh)
    (15.0, 15.6, 77.4, 77.9, ['Diamond', 'Gold'], 'Kurnool Diamond Zone'),
    # Eastern Ghats REE / Niobium
    (14.5, 16.0, 79.0, 80.5, ['Niobium', 'Zirconium', 'Thorium', 'Uranium'], 'Eastern Ghats Belt'),
]

def get_belt_for_point(lat, lon):
    """Return (belt_name, minerals) if point is inside a named belt, else (None, [])."""
    for (lat_min, lat_max, lon_min, lon_max, minerals, belt_name) in MINERAL_BELTS:
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return belt_name, minerals
    return None, []


# ─── Point-in-Polygon (Ray Casting) ─────────────────────────────────────────
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

    ml_dir   = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(ml_dir)
    data_dir = os.path.join(base_dir, "data")

    model_path   = os.path.join(ml_dir,  "best_model.pkl")
    ngcm_path    = os.path.join(data_dir, "ngcm.csv")
    geology_path = os.path.join(data_dir, "geology.csv")
    min_occ_path = os.path.join(data_dir, "mineral_occurrence.csv")

    # ── Load model ──────────────────────────────────────────────────────────
    if not os.path.exists(model_path):
        print(json.dumps({"error": f"Model pkl not found at {model_path}"}))
        sys.exit(1)
    model = joblib.load(model_path)

    # ── Load datasets ────────────────────────────────────────────────────────
    if not (os.path.exists(ngcm_path) and os.path.exists(geology_path) and os.path.exists(min_occ_path)):
        print(json.dumps({"error": "Reference datasets missing from data/ folder."}))
        sys.exit(1)

    df_ngcm    = pd.read_csv(ngcm_path)
    df_geology = pd.read_csv(geology_path)
    df_min_occ = pd.read_csv(min_occ_path)

    lat_in = args.latitude
    lon_in = args.longitude

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 0 — Belt check FIRST (before bounds), then loose bounds check
    # Belt check must come before bounds so that known belts like Kolar Gold
    # Field (which lie outside NGCM coverage) are still handled correctly.
    # ════════════════════════════════════════════════════════════════════════
    belt_name_early, belt_minerals_early = get_belt_for_point(lat_in, lon_in)

    dists       = np.sqrt((df_ngcm['latitude'] - lat_in)**2 + (df_ngcm['longitude'] - lon_in)**2)
    min_dist    = dists.min()
    nearest_idx = dists.idxmin()

    # If completely outside coverage AND not in any known belt → return empty
    if min_dist > 0.5 and not belt_minerals_early:
        result = {
            "mineral_probability":     0,
            "predicted_minerals":      [],
            "documented_minerals":     [],
            "mineral_percentages":     {},
            "confidence":              "Low",
            "geological_zone":         "Outside Coverage Area",
            "rock_type":               "Unknown",
            "lithology":               "Unknown",
            "geological_unit":         "Unknown",
            "formation":               "Unknown",
            "belt_name":               "",
            "nearest_mineral":         "None",
            "nearest_mineral_dist_km": round(min_dist * 111, 2),
            "altitude":                args.altitude,
            "explanation":             "This coordinate is outside the Karnataka & Andhra Pradesh geological survey coverage area."
        }
        print(json.dumps(result))
        sys.exit(0)

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 1 — Known Mineral Occurrence Search (25 km buffer)
    # ════════════════════════════════════════════════════════════════════════
    # x = longitude, y = latitude in occurrence CSV
    dists_km = np.sqrt(
        (df_min_occ['y'] - lat_in)**2 + (df_min_occ['x'] - lon_in)**2
    ) * 111.0

    # Primary: within 5 km — direct occurrence
    primary_mask   = dists_km <= 5.0
    # Secondary: within 25 km — zone occurrence
    secondary_mask = dists_km <= 25.0

    documented_minerals = []
    nearest_mineral     = "None"
    nearest_mineral_dist_km = float(dists_km.min())
    occurrence_present  = False

    if primary_mask.any():
        occurrence_present = True
        commodities = df_min_occ.loc[primary_mask, 'commodity'].tolist()
        for c in commodities:
            norm = normalize_commodity(c)
            if norm not in documented_minerals:
                documented_minerals.append(norm)
        nearest_mineral = documented_minerals[0]
    elif secondary_mask.any():
        commodities = df_min_occ.loc[secondary_mask, 'commodity'].tolist()
        for c in commodities:
            norm = normalize_commodity(c)
            if norm not in documented_minerals:
                documented_minerals.append(norm)
        nearest_mineral = documented_minerals[0] if documented_minerals else "None"

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 2 — Geological Belt Inheritance
    # ════════════════════════════════════════════════════════════════════════
    belt_name, belt_minerals = get_belt_for_point(lat_in, lon_in)
    if belt_minerals:
        for bm in belt_minerals:
            if bm not in documented_minerals:
                documented_minerals.append(bm)
        if belt_minerals and nearest_mineral == "None":
            nearest_mineral = belt_minerals[0]
        if belt_minerals:
            occurrence_present = True  # belt counts as documented zone

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 3 — Geological Rock Type via Shapefile GIS
    # ════════════════════════════════════════════════════════════════════════
    nearest_ngcm_row = df_ngcm.iloc[[nearest_idx]].copy()
    nearest_geo_row  = df_geology.iloc[[nearest_idx]].copy() if nearest_idx < len(df_geology) else pd.DataFrame()

    # Build full_row for ML
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

    db_rock_type = "Granite"
    db_lithology = "Granitic Gneiss"
    db_geo_unit  = "Dharwar Craton"
    db_formation = "Unknown Formation"
    intersected  = False

    try:
        import shapefile
        shp_path = os.path.join(data_dir, "extracted", "25K",
                                "lithology_25k_ngdr_20250224140917945",
                                "lithology_25k_ngdr")
        if os.path.exists(shp_path + ".shp"):
            sf      = shapefile.Reader(shp_path)
            shapes  = sf.shapes()
            records = sf.records()

            matching = []
            for i in range(len(shapes)):
                bbox = shapes[i].bbox
                if bbox[0] <= lon_in <= bbox[2] and bbox[1] <= lat_in <= bbox[3]:
                    area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                    matching.append((area, i))
            matching.sort(key=lambda t: t[0])

            for _, i in matching:
                shape  = shapes[i]
                parts  = list(shape.parts) + [len(shape.points)]
                for p in range(len(shape.parts)):
                    poly_pts = shape.points[parts[p]:parts[p+1]]
                    if point_in_polygon(lon_in, lat_in, poly_pts):
                        rec = records[i].as_dict()
                        db_rock_type = rec.get('lithologic', 'Granite') or 'Granite'
                        db_lithology = rec.get('standard_l', 'Granitic Gneiss') or 'Granitic Gneiss'
                        db_geo_unit  = rec.get('major_mine', 'Dharwar Craton') or 'Dharwar Craton'
                        db_formation = rec.get('formation', 'Unknown Formation') or 'Unknown Formation'
                        intersected  = True
                        break
                if intersected:
                    break
    except Exception:
        pass

    if not intersected and not nearest_geo_row.empty:
        def _safe(col, default):
            if col in nearest_geo_row.columns:
                v = nearest_geo_row[col].values[0]
                return str(v) if not pd.isna(v) else default
            return default
        db_rock_type = _safe('rock_type', 'Granite')
        db_lithology = _safe('lithology_category', 'Granitic Gneiss')
        db_geo_unit  = _safe('geological_unit', 'Dharwar Craton')
        db_formation = _safe('stratigraphy', 'Unknown Formation')

    # Override belt geo unit name if a known belt matched
    if belt_name:
        db_geo_unit = belt_name

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 4 — ML Prediction
    # ════════════════════════════════════════════════════════════════════════
    full_row = full_row.copy()
    full_row['latitude']  = lat_in
    full_row['longitude'] = lon_in
    full_row['rock_type'] = db_rock_type

    fe_val    = args.fe
    fe2o3_val = fe_val * 1.43 / 10000.0 if fe_val > 100.0 else fe_val
    full_row['fe2o3__'] = fe2o3_val
    full_row['cu_ppm']  = args.cu
    full_row['zn_ppm']  = args.zn

    features_cols       = model.feature_names_in_
    X_input             = full_row.reindex(columns=features_cols, fill_value=0)
    pred_score          = float(model.predict(X_input)[0])
    mineral_probability = float(np.clip(pred_score, 0.0, 1.0))

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 5 — Confidence & Probability Adjustment
    # ════════════════════════════════════════════════════════════════════════
    # If we have a documented occurrence or belt, apply a minimum floor
    if occurrence_present and primary_mask.any():
        # Direct occurrence: minimum 65% probability
        mineral_probability = max(mineral_probability, 0.65)
        confidence = "High"
    elif occurrence_present:
        # Belt or zone occurrence: minimum 40%
        mineral_probability = max(mineral_probability, 0.40)
        confidence = "Medium"
    elif mineral_probability >= 0.60:
        confidence = "High"
    elif mineral_probability >= 0.30:
        confidence = "Medium"
    else:
        confidence = "Low"

    prob_percent = int(round(mineral_probability * 100))

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 6 — Mineral Inventory (All 26 minerals with concentrations)
    # ════════════════════════════════════════════════════════════════════════
    ALL_MINERALS = [
        "Iron", "Copper", "Zinc", "Gold", "Manganese", "Nickel", "Lead",
        "Chromium", "Vanadium", "Cobalt", "Titanium", "Molybdenum", "Tin",
        "Tungsten", "Silver", "Arsenic", "Bismuth", "Antimony", "Barite",
        "Uranium", "Thorium", "Niobium", "Zirconium", "Diamond", "Quartzite", "Clay"
    ]

    def safe_col(col, default=0.0):
        if col in full_row.columns:
            val = full_row[col].values[0]
            return float(val) if not pd.isna(val) else default
        return default

    def pct_for(min_name):
        # Boost documented minerals with occurrence premium
        occ_boost = 1.5 if min_name in documented_minerals else 1.0
        mapping = {
            "Iron":      lambda: round(max(fe2o3_val, safe_col('fe2o3__', 0.5)) * occ_boost, 4),
            "Copper":    lambda: round(max(args.cu, safe_col('cu_ppm', 1.0)) / 10000.0 * occ_boost, 6),
            "Zinc":      lambda: round(max(args.zn, safe_col('zn_ppm', 1.0)) / 10000.0 * occ_boost, 6),
            "Gold":      lambda: round(max(safe_col('au_ppb', 0.001), 0.001) / 1_000_000.0 * occ_boost, 8),
            "Manganese": lambda: round(max(safe_col('mno__', 0.01), 0.01) * occ_boost, 4),
            "Nickel":    lambda: round(max(safe_col('ni_ppm', 1.0), 1.0) / 10000.0 * occ_boost, 6),
            "Lead":      lambda: round(max(safe_col('pb_ppm', 1.0), 1.0) / 10000.0 * occ_boost, 6),
            "Chromium":  lambda: round(max(safe_col('cr_ppm', 1.0), 1.0) / 10000.0 * occ_boost, 6),
            "Vanadium":  lambda: round(max(safe_col('v_ppm', 1.0), 1.0) / 10000.0 * occ_boost, 6),
            "Cobalt":    lambda: round(max(safe_col('co_ppm', 0.5), 0.5) / 10000.0 * occ_boost, 6),
            "Titanium":  lambda: round(max(safe_col('tio2__', 0.01), 0.01) * occ_boost, 4),
            "Molybdenum":lambda: round(max(safe_col('mo_ppm', 0.5), 0.5) / 10000.0 * occ_boost, 6),
            "Tin":       lambda: round(max(safe_col('sn_ppm', 0.5), 0.5) / 10000.0 * occ_boost, 6),
            "Tungsten":  lambda: round(max(safe_col('w_ppm', 0.5), 0.5) / 10000.0 * occ_boost, 6),
            "Silver":    lambda: round(max(safe_col('ag_ppm', 0.1), 0.1) / 10000.0 * occ_boost, 8),
            "Arsenic":   lambda: round(max(safe_col('as_ppm', 0.1), 0.1) / 10000.0 * occ_boost, 6),
            "Bismuth":   lambda: round(max(safe_col('bi_ppm', 0.01), 0.01) / 10000.0 * occ_boost, 6),
            "Antimony":  lambda: round(max(safe_col('sb_ppm', 0.01), 0.01) / 10000.0 * occ_boost, 6),
            "Barite":    lambda: round(max(safe_col('ba_ppm', 1.0), 1.0) / 10000.0 * occ_boost, 6),
            "Uranium":   lambda: round(max(safe_col('u_ppm', 0.1), 0.1) / 10000.0 * occ_boost, 8),
            "Thorium":   lambda: round(max(safe_col('th_ppm', 0.1), 0.1) / 10000.0 * occ_boost, 8),
            "Niobium":   lambda: round(max(safe_col('nb_ppm', 0.1), 0.1) / 10000.0 * occ_boost, 6),
            "Zirconium": lambda: round(max(safe_col('zr_ppm', 1.0), 1.0) / 10000.0 * occ_boost, 6),
            "Diamond":   lambda: round(0.0001 * occ_boost, 6),
            "Quartzite": lambda: round(max(safe_col('si02__', 50.0), 50.0), 2),
            "Clay":      lambda: round(max(safe_col('al2o3__', 10.0), 10.0), 2),
        }
        fn = mapping.get(min_name)
        return fn() if fn else 1.5

    mineral_percentages = {m: pct_for(m) for m in ALL_MINERALS}
    predicted_minerals  = sorted(ALL_MINERALS, key=lambda m: mineral_percentages.get(m, 0), reverse=True)

    # ── Explanation ─────────────────────────────────────────────────────────
    occ_str  = ", ".join(documented_minerals[:3]) if documented_minerals else None
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

    # ── Final Output ─────────────────────────────────────────────────────────
    result = {
        "mineral_probability":       prob_percent,
        "predicted_minerals":        predicted_minerals,
        "documented_minerals":       documented_minerals,
        "mineral_percentages":       mineral_percentages,
        "confidence":                confidence,
        "geological_zone":           db_formation,
        "rock_type":                 db_rock_type,
        "lithology":                 db_lithology,
        "geological_unit":           db_geo_unit,
        "formation":                 db_formation,
        "belt_name":                 belt_name or "",
        "nearest_mineral":           nearest_mineral,
        "nearest_mineral_dist_km":   round(nearest_mineral_dist_km, 2),
        "occurrence_present":        occurrence_present,
        "altitude":                  args.altitude,
        "explanation":               explanation,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
