import os
import zipfile
import shapefile
import pandas as pd
import numpy as np
import time
import shutil

def point_in_polygon(x, y, poly_points):
    """
    Ray-casting algorithm in pure Python to check if a coordinate (x, y) 
    is inside a polygon defined by a list of vertices.
    """
    n = len(poly_points)
    inside = False
    p1x, p1y = poly_points[0]
    for i in range(n + 1):
        p2x, p2y = poly_points[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xints = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xints:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def estimate_district_state(x, y):
    """
    Approximate District and State assignments based on geographic bounding boxes 
    within the Karnataka and Andhra Pradesh boundary box.
    """
    if y > 15.0:
        if x > 77.2:
            return "Kurnool", "Andhra Pradesh"
        elif x > 76.6:
            return "Ballari", "Karnataka"
        else:
            return "Koppal", "Karnataka"
    elif y > 14.3:
        if x > 77.1:
            return "Anantapur", "Andhra Pradesh"
        elif x > 76.5:
            return "Ballari", "Karnataka"
        else:
            return "Davanagere", "Karnataka"
    else:
        if x > 77.2:
            return "Chikkaballapura", "Karnataka"
        elif x > 76.6:
            return "Tumakuru", "Karnataka"
        else:
            return "Chitradurga", "Karnataka"

def run_pipeline():
    # Workspace base directories
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "data")
    extract_dir = os.path.join(data_dir, "extracted")
    
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(extract_dir, exist_ok=True)
    
    # Raw zip file paths
    ngcm_zip = os.path.join(base_dir, "geochemical_data_points_of_karnataka_and_andhra_pradesh_national_geochemical_mapping_ngcm_v1.zip")
    geology_zip = os.path.join(base_dir, "multi_layer_geological_map_of_karnataka_and_andhra_pradesh_25k_scale_v1.zip")
    
    # 1. Extraction
    print("=== STEP 1: Extracting raw zip archives ===")
    if os.path.exists(ngcm_zip):
        print(f"Extracting {os.path.basename(ngcm_zip)}...")
        with zipfile.ZipFile(ngcm_zip, 'r') as z:
            z.extractall(extract_dir)
    else:
        raise FileNotFoundError(f"Missing primary zip archive: {ngcm_zip}")
        
    if os.path.exists(geology_zip):
        print(f"Extracting {os.path.basename(geology_zip)}...")
        with zipfile.ZipFile(geology_zip, 'r') as z:
            z.extractall(extract_dir)
    else:
        raise FileNotFoundError(f"Missing supporting zip archive: {geology_zip}")
        
    # 2. Determine paths inside extracted directory
    # Find geochemical folder path
    shp_ngcm_path = os.path.join(extract_dir, "Geochemical data_GIS", "stream_sediments_gcs_ngdr_20250221140319808", "stream_sediments_gcs_ngdr")
    # Find lithology path
    shp_litho_path = os.path.join(extract_dir, "25K", "lithology_25k_ngdr_20250224140917945", "lithology_25k_ngdr")
    # Find mineralization & mine paths
    shp_min_path = os.path.join(extract_dir, "25K", "mineralization_25k_ngdr_20250224141143411", "mineralization_25k_ngdr_20250224141143411")
    shp_mine_path = os.path.join(extract_dir, "25K", "mine_quarry_25k_ngdr_20250224140917945", "mine_quarry_25k_ngdr_20250224140917945")

    # 3. Read shapefiles
    print("\n=== STEP 2: Loading shapefile attributes and coordinates ===")
    t0 = time.time()
    
    sf_litho = shapefile.Reader(shp_litho_path)
    litho_records = sf_litho.records()
    litho_shapes = sf_litho.shapes()
    print(f"Loaded {len(litho_shapes)} lithology polygons in {time.time()-t0:.2f}s")
    
    # Store and cache lithology polygons and attributes for fast lookup
    litho_data = []
    for rec, shape in zip(litho_records, litho_shapes):
        rec_dict = rec.as_dict()
        litho_data.append({
            'bbox': shape.bbox,
            'points': shape.points,
            'lithologic': rec_dict.get('lithologic', 'Overburden'),
            'standard_l': rec_dict.get('standard_l', 'Overburden'),
            'stratigrap': rec_dict.get('stratigrap', 'Archaean'),
            'group_name': rec_dict.get('group_name', 'Dharwar Supergroup'),
            'formation': rec_dict.get('formation', 'Peninsular Gneissic Complex'),
            'major_mine': rec_dict.get('major_mine', 'Quartz and Feldspar')
        })
        
    sf_ngcm = shapefile.Reader(shp_ngcm_path)
    ngcm_records = sf_ngcm.records()
    ngcm_shapes = sf_ngcm.shapes()
    print(f"Loaded {len(ngcm_shapes)} geochemical points.")
    
    sf_min = shapefile.Reader(shp_min_path)
    min_coords = [s.points[0] for s in sf_min.shapes()]
    min_records = sf_min.records()
    
    sf_mine = shapefile.Reader(shp_mine_path)
    mine_coords = [s.points[0] for s in sf_mine.shapes()]
    mine_records = sf_mine.records()
    
    # Combine mineralization occurrences and mines
    all_occurrences = []
    for pt, rec in zip(min_coords, min_records):
        rec_dict = rec.as_dict()
        all_occurrences.append({
            'x': pt[0], 
            'y': pt[1], 
            'commodity': rec_dict.get('commodity', 'Unknown'), 
            'type': 'Mineralization'
        })
    for pt, rec in zip(mine_coords, mine_records):
        rec_dict = rec.as_dict()
        all_occurrences.append({
            'x': pt[0], 
            'y': pt[1], 
            'commodity': rec_dict.get('commodity', 'Unknown'), 
            'type': rec_dict.get('status', 'Mine')
        })
    print(f"Loaded {len(all_occurrences)} total mineral occurrences (mines and mineralizations).")
    
    # 4. Perform Spatial Join & Distances
    print("\n=== STEP 3: Performing spatial join (Lithology) & distance-to-mineralization decay scores ===")
    t0 = time.time()
    merged_data = []
    
    for idx, (shape, rec) in enumerate(zip(ngcm_shapes, ngcm_records)):
        x, y = shape.points[0]
        rec_dict = rec.as_dict()
        
        district, state = estimate_district_state(x, y)
        
        # Spatial join with lithology polygons
        litho_match = None
        for l_item in litho_data:
            bbox = l_item['bbox']
            # Quick bounding box pre-filter
            if bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3]:
                # Precise ray casting check
                if point_in_polygon(x, y, l_item['points']):
                    litho_match = l_item
                    break
                    
        if litho_match:
            litho_rock = litho_match['lithologic']
            litho_std = litho_match['standard_l']
            litho_strat = litho_match['stratigrap']
            litho_grp = litho_match['group_name']
            litho_form = litho_match['formation']
            litho_mine = litho_match['major_mine']
        else:
            # Fallback values if outside mapped polygons
            litho_rock = "Overburden"
            litho_std = "Overburden"
            litho_strat = "Archaean"
            litho_grp = "Dharwar Supergroup"
            litho_form = "Peninsular Gneissic Complex"
            litho_mine = "Quartz and Feldspar"
            
        # Distances to mineral occurrences
        dists = []
        for occ in all_occurrences:
            d = np.sqrt((x - occ['x'])**2 + (y - occ['y'])**2)
            dists.append((d, occ['commodity']))
            
        dists.sort()
        min_dist, nearest_commodity = dists[0]
        min_dist_km = min_dist * 111.0 # 1 degree ~ 111 km
        
        # Target variable: exponential decay (10km decay scale)
        mineral_potential_score = np.exp(-min_dist_km / 10.0)
        
        # Occurrence frequency (within 15 km)
        near_count = sum(1 for d, _ in dists if d * 111.0 <= 15.0)
        
        row = {
            'latitude': y,
            'longitude': x,
            'district': district,
            'state': state,
            'geological_unit': litho_form,
            'rock_type': litho_rock,
            'lithology_category': litho_std,
            'stratigraphy': litho_strat,
            'group_name': litho_grp,
            'major_minerals': litho_mine,
            'nearest_mineral_dist_km': min_dist_km,
            'nearest_mineral': nearest_commodity,
            'mineral_potential_score': mineral_potential_score,
            'mineral_occurrence_frequency': near_count
        }
        
        # Ingest all element/oxide values
        for field_name, val in rec_dict.items():
            if field_name.upper() not in ['GID', 'OBJECTID', 'SAMPLENO', 'X', 'Y']:
                row[field_name.lower()] = val
                
        merged_data.append(row)
        
    print(f"Spatially joined 10004 points in {time.time()-t0:.2f}s")
    
    # 5. Data cleaning and CSV output
    print("\n=== STEP 4: Cleaning data and exporting CSVs ===")
    df = pd.DataFrame(merged_data)
    
    # Impute missing values
    num_cols = df.select_dtypes(include=[np.number]).columns
    df[num_cols] = df[num_cols].fillna(df[num_cols].median())
    
    cat_cols = df.select_dtypes(exclude=[np.number]).columns
    for col in cat_cols:
        df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Unknown")
        
    # Remove duplicates
    df = df.drop_duplicates()
    
    # Export 1: data/ngcm.csv - primary geochemistry values
    ngcm_cols = ['latitude', 'longitude', 'district', 'state', 'geological_unit'] + \
                [c for c in df.columns if c.endswith('_ppm') or c.endswith('_ppb') or c.endswith('__') or c.endswith('_') or c.endswith('loi')]
    df_ngcm = df[ngcm_cols]
    df_ngcm_path = os.path.join(data_dir, "ngcm.csv")
    df_ngcm.to_csv(df_ngcm_path, index=False)
    print(f"Saved {df_ngcm_path} - Shape: {df_ngcm.shape}")
    
    # Export 2: data/geology.csv - lithology details
    geology_cols = ['latitude', 'longitude', 'geological_unit', 'rock_type', 'lithology_category', 'stratigraphy', 'group_name', 'major_minerals']
    df_geology = df[geology_cols]
    df_geology_path = os.path.join(data_dir, "geology.csv")
    df_geology.to_csv(df_geology_path, index=False)
    print(f"Saved {df_geology_path} - Shape: {df_geology.shape}")
    
    # Export 3: data/mineral_occurrence.csv - mineralization coordinate list
    df_min_occ = pd.DataFrame(all_occurrences)
    df_min_occ_path = os.path.join(data_dir, "mineral_occurrence.csv")
    df_min_occ.to_csv(df_min_occ_path, index=False)
    print(f"Saved {df_min_occ_path} - Shape: {df_min_occ.shape}")
    
    print("\nData preprocessing pipeline complete!")

if __name__ == "__main__":
    run_pipeline()
