import os
import pandas as pd
import numpy as np
import joblib
import time
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

# Set matplotlib backend to non-interactive to avoid GUI popup errors
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

def train_and_evaluate():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "data")
    models_dir = os.path.join(base_dir, "models")
    os.makedirs(models_dir, exist_ok=True)
    
    print("=== loading preprocessed datasets ===")
    df_ngcm = pd.read_csv(os.path.join(data_dir, "ngcm.csv"))
    df_geology = pd.read_csv(os.path.join(data_dir, "geology.csv"))
    df_min_occ = pd.read_csv(os.path.join(data_dir, "mineral_occurrence.csv"))
    
    # Merge on coordinates and geological unit
    df = pd.merge(df_ngcm, df_geology, on=['latitude', 'longitude', 'geological_unit'])
    
    print("=== calculating target variable (mineral potential score) ===")
    lat_ngcm = df['latitude'].values
    lon_ngcm = df['longitude'].values
    lat_min = df_min_occ['y'].values
    lon_min = df_min_occ['x'].values
    
    min_dists_km = []
    for lat, lon in zip(lat_ngcm, lon_ngcm):
        # Euclidean distance in degrees scaled to km (1 deg ~ 111 km)
        d = np.sqrt((lat - lat_min)**2 + (lon - lon_min)**2) * 111.0
        min_dists_km.append(np.min(d))
        
    df['nearest_mineral_dist_km'] = min_dists_km
    # Exponential decay distance mapping (decay scale 10km)
    df['mineral_potential_score'] = np.exp(-df['nearest_mineral_dist_km'] / 10.0)
    
    # Define features and target
    geo_features = [c for c in df_ngcm.columns if c.endswith('_ppm') or c.endswith('_ppb') or c.endswith('__') or c.endswith('_') or c.endswith('loi')]
    cat_features = ['rock_type', 'geological_unit', 'district']
    features = geo_features + cat_features
    target = 'mineral_potential_score'
    
    X = df[features]
    y = df[target]
    
    # Train-test split (80/20, random_state=42)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)
    print(f"Training samples: {X_train.shape[0]}")
    print(f"Testing samples: {X_test.shape[0]}")
    
    # Preprocessor
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), geo_features),
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cat_features)
        ])
    
    # Regressor
    rf_reg = RandomForestRegressor(random_state=42, n_jobs=-1)
    
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('regressor', rf_reg)
    ])
    
    # GridSearchCV parameter tuning as requested
    param_grid = {
        'regressor__n_estimators': [100, 150],
        'regressor__max_depth': [15, None],
        'regressor__min_samples_split': [2, 5]
    }
    
    print("\n=== running hyperparameter tuning via GridSearchCV ===")
    t0 = time.time()
    grid_search = GridSearchCV(
        estimator=pipeline,
        param_grid=param_grid,
        cv=3,
        scoring='r2',
        n_jobs=-1,
        verbose=1
    )
    grid_search.fit(X_train, y_train)
    t1 = time.time()
    print(f"GridSearchCV completed in {t1-t0:.2f}s")
    print(f"Best Parameters: {grid_search.best_params_}")
    
    best_model = grid_search.best_estimator_
    
    # Evaluate best model
    y_pred = best_model.predict(X_test)
    
    r2 = r2_score(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    mae = mean_absolute_error(y_test, y_pred)
    
    print("\n=== EVALUATION METRICS ===")
    print(f"Training Samples: {X_train.shape[0]}")
    print(f"Testing Samples:  {X_test.shape[0]}")
    print(f"R² Score:         {r2:.5f}")
    print(f"RMSE:             {rmse:.5f}")
    print(f"MAE:              {mae:.5f}")
    
    # Serialize the best model pipeline
    best_model_path = os.path.join(models_dir, "best_model.pkl")
    joblib.dump(best_model, best_model_path)
    print(f"\nModel saved successfully at: {best_model_path}")
    
    # Generate Evaluation Charts
    print("\n=== generating evaluation plots ===")
    
    # 1. Predicted vs Actual
    plt.figure(figsize=(8, 6))
    sns.scatterplot(x=y_test, y=y_pred, alpha=0.5, color="#1f77b4")
    plt.plot([0, 1], [0, 1], color="red", linestyle="--", linewidth=2)
    plt.title("Predicted vs. Actual Mineral Potential Score", fontsize=12, pad=10)
    plt.xlabel("Actual Score", fontsize=10)
    plt.ylabel("Predicted Score", fontsize=10)
    plt.xlim(-0.05, 1.05)
    plt.ylim(-0.05, 1.05)
    plt.grid(True, linestyle=":", alpha=0.6)
    pred_vs_act_path = os.path.join(models_dir, "predicted_vs_actual.png")
    plt.savefig(pred_vs_act_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Saved: {pred_vs_act_path}")
    
    # 2. Feature Importance
    # Extract feature names after transformer
    num_feat_names = geo_features
    cat_encoder = best_model.named_steps['preprocessor'].named_transformers_['cat']
    cat_feat_names = list(cat_encoder.get_feature_names_out(cat_features))
    all_feat_names = num_feat_names + cat_feat_names
    
    importances = best_model.named_steps['regressor'].feature_importances_
    
    # Map importances back to their categories (to aggregate categories if they are one-hot encoded,
    # or just show the top one-hot encoded sub-features)
    # Showing top 15 most important features
    df_importances = pd.DataFrame({
        'Feature': all_feat_names,
        'Importance': importances
    }).sort_values(by='Importance', ascending=False)
    
    plt.figure(figsize=(10, 6))
    sns.barplot(
        x='Importance',
        y='Feature',
        data=df_importances.head(15),
        palette="viridis",
        hue='Feature',
        legend=False
    )
    plt.title("Top 15 Feature Importances", fontsize=12, pad=10)
    plt.xlabel("Gini Importance", fontsize=10)
    plt.ylabel("Feature", fontsize=10)
    plt.grid(True, axis='x', linestyle=":", alpha=0.6)
    feat_imp_path = os.path.join(models_dir, "feature_importance.png")
    plt.savefig(feat_imp_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Saved: {feat_imp_path}")
    
    # Print top 10 features
    print("\nTop 10 Feature Importances:")
    for idx, row in df_importances.head(10).iterrows():
        print(f"  {row['Feature']}: {row['Importance']:.5f}")
        
    # 3. Correlation Heatmap
    # Take the top 12 elements plus target and calculate correlation
    top_elements = [c for c in df_importances['Feature'].values if c in geo_features][:12]
    corr_df = df[top_elements + ['mineral_potential_score']].corr()
    
    plt.figure(figsize=(10, 8))
    sns.heatmap(
        corr_df,
        annot=True,
        cmap="coolwarm",
        fmt=".2f",
        square=True,
        linewidths=.5,
        cbar_kws={"shrink": .8}
    )
    plt.title("Correlation Heatmap: Top Geochemical Elements & Target", fontsize=12, pad=15)
    corr_heatmap_path = os.path.join(models_dir, "correlation_heatmap.png")
    plt.savefig(corr_heatmap_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Saved: {corr_heatmap_path}")

if __name__ == "__main__":
    train_and_evaluate()
