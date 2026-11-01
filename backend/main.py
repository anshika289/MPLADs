"""
MPLADS Fund Monitoring API — v2.0
FastAPI backend with anomaly detection, SHAP explanations, and analytics.
"""

import warnings
warnings.filterwarnings("ignore")

from pathlib import Path
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd
import joblib
import shap

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MPLADS Fund Monitoring API",
    description="API for an MPLADS-inspired anomaly detection project",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_ROOT = Path(__file__).resolve().parent.parent

MODEL_PATH = _ROOT / "model" / "mplads_model_export" / "model_bundle.joblib"
DATA_PATH  = _ROOT / "data" / "MPLADS_Synthetic_Anomaly_Dataset.csv"
SYNTHETIC_FINANCE_PATH = _ROOT / "data" / "MPLADS_Synthetic_Constituency_Finances.csv"

# ---------------------------------------------------------------------------
# Model bundle
# ---------------------------------------------------------------------------

bundle       = joblib.load(MODEL_PATH)
model        = bundle["model"]
scaler       = bundle["scaler"]
FEATURE_NAMES: list[str] = list(bundle["feature_names"])

# ---------------------------------------------------------------------------
# Dataset — loaded once at startup
# ---------------------------------------------------------------------------

_df: pd.DataFrame = pd.read_csv(DATA_PATH)

# Ensure Anomaly_Label is int
_df["Anomaly_Label"] = _df["Anomaly_Label"].astype(int)

# ---------------------------------------------------------------------------
# Training statistics (mean / std / percentiles per feature)
# ---------------------------------------------------------------------------

_feat_means: dict[str, float] = {}
_feat_stds:  dict[str, float] = {}
_feat_p5:    dict[str, float] = {}
_feat_p95:   dict[str, float] = {}

for _feat in FEATURE_NAMES:
    _col = _df[_feat]
    _feat_means[_feat] = float(_col.mean())
    _feat_stds[_feat]  = float(_col.std(ddof=0))
    _feat_p5[_feat]    = float(np.percentile(_col, 5))
    _feat_p95[_feat]   = float(np.percentile(_col, 95))

# ---------------------------------------------------------------------------
# Pre-scaled dataset + decision-function scores for every row
# ---------------------------------------------------------------------------

_X_all      = _df[FEATURE_NAMES].values.astype(float)
_X_scaled   = scaler.transform(_X_all)
_all_scores = model.decision_function(_X_scaled)          # shape (N,)

# ---------------------------------------------------------------------------
# Normal records for similar-record lookup (scaled)
# ---------------------------------------------------------------------------

_normal_mask     = _df["Anomaly_Label"].values == 0
_X_normal_scaled = _X_scaled[_normal_mask]
_df_normal       = _df[_normal_mask].reset_index(drop=True)

# ---------------------------------------------------------------------------
# SHAP explainer — background from 100 random scaled rows
# ---------------------------------------------------------------------------

_rng = np.random.default_rng(42)
_bg_idx        = _rng.choice(len(_X_scaled), size=min(100, len(_X_scaled)), replace=False)
_bg_data       = _X_scaled[_bg_idx]

_shap_explainer = shap.KernelExplainer(
    lambda x: model.decision_function(x),
    _bg_data,
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ProjectData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    Population:           float = Field(ge=0)
    Literacy_Rate:        float = Field(ge=0, le=100)
    Health_Index:         float = Field(ge=0, le=1)
    Infrastructure_Index: float = Field(ge=0, le=1)
    Sanitation_Index:     float = Field(ge=0, le=1)
    Rate_of_Inflation:    float
    Expected_Expense:     float = Field(ge=0)
    Funds_Allocated:      float = Field(ge=0)
    Funds_Released:       float = Field(ge=0)
    Project_Count:        float = Field(ge=0)
    Expected_Duration:    float = Field(gt=0)
    Actual_Duration:      float = Field(gt=0)
    Actual_Expense:       float = Field(ge=0)
    Completed_Projects:   float = Field(ge=0)
    Pending_Projects:     float = Field(ge=0)
    Utilisation_Rate:     float
    Cost_Deviation:       float
    Duration_Ratio:       float
    Completion_Rate:      float
    Fund_Utilisation_Gap: float
    Cost_Per_Project:     float


class BatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    records: list[ProjectData]


class DriftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    records: list[ProjectData]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _confidence_tier(score: float) -> str:
    if score < -0.3:
        return "HIGH_RISK"
    if score < -0.1:
        return "MEDIUM_RISK"
    if score < 0.0:
        return "LOW_RISK"
    return "NORMAL"


def _rule_violations(v: dict[str, float]) -> list[str]:
    violations: list[str] = []
    if v["Actual_Expense"] > 0 and v["Completed_Projects"] == 0:
        violations.append("Expense recorded with zero completed projects")
    if v["Funds_Released"] > v["Funds_Allocated"]:
        violations.append("Funds released exceed allocation")
    if v["Actual_Expense"] > v["Funds_Released"] * 1.05:
        violations.append("Actual spend exceeds released funds")
    if v["Funds_Released"] > 0 and v["Utilisation_Rate"] < 0.1:
        violations.append("Suspiciously low utilisation with released funds")
    if v["Duration_Ratio"] > 3:
        violations.append("Duration ratio extreme")
    if v["Project_Count"] > 0 and (v["Completed_Projects"] + v["Pending_Projects"]) > v["Project_Count"] * 1.5:
        violations.append("Project count mismatch")
    if v["Actual_Expense"] == 0 and v["Actual_Duration"] > 6:
        violations.append("Zero-spend with long duration")
    return violations


def _feature_deviations(values: dict[str, float]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for feat in FEATURE_NAMES:
        val  = values[feat]
        mean = _feat_means[feat]
        std  = _feat_stds[feat]
        z    = round((val - mean) / std, 2) if std != 0 else 0.0
        result[feat] = {"value": val, "mean": round(mean, 4), "std": round(std, 4), "z_score": z}
    return result


def _natural_language_explanation(deviations: dict[str, dict]) -> str:
    # Pick top 3 by absolute z-score
    sorted_feats = sorted(deviations.items(), key=lambda x: abs(x[1]["z_score"]), reverse=True)[:3]
    parts: list[str] = []
    for feat, info in sorted_feats:
        z   = info["z_score"]
        direction = "above" if z > 0 else "below"
        parts.append(f"{feat} is {abs(z)} standard deviations {direction} average")
    if not parts:
        return "No significant feature deviations detected."
    return "This record was flagged mainly because " + ", and ".join(parts) + "."


def _similar_normal_records(scaled_row: np.ndarray, n: int = 3) -> list[dict]:
    dists  = np.linalg.norm(_X_normal_scaled - scaled_row, axis=1)
    top_idx = np.argsort(dists)[:n]
    results = []
    for i in top_idx:
        row_dict = {feat: float(_df_normal.iloc[i][feat]) for feat in FEATURE_NAMES}
        row_dict["Anomaly_Label"] = int(_df_normal.iloc[i]["Anomaly_Label"])
        results.append(row_dict)
    return results


def _shap_values_for_row(scaled_row: np.ndarray) -> dict[str, float]:
    shap_vals = _shap_explainer.shap_values(scaled_row, silent=True)
    # OneClassSVM KernelExplainer returns shape (1, n_features)
    if isinstance(shap_vals, list):
        shap_vals = shap_vals[0]
    arr = np.array(shap_vals)
    if arr.ndim == 2:
        arr = arr[0]
    return {FEATURE_NAMES[i]: round(float(arr[i]), 4) for i in range(len(FEATURE_NAMES))}


# ---------------------------------------------------------------------------
# Existing endpoints (unchanged behaviour)
# ---------------------------------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "MPLADS Fund Monitoring API is running",
        "status": "healthy",
    }


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /api/predict  (enhanced)
# ---------------------------------------------------------------------------

@app.post("/api/predict")
def predict_anomaly(project: ProjectData):
    values = project.model_dump()

    row = np.array([[values[name] for name in FEATURE_NAMES]], dtype=float)

    if not np.isfinite(row).all():
        raise HTTPException(status_code=422, detail="Feature values must be finite numbers.")

    scaled_row  = scaler.transform(row)
    prediction  = int(model.predict(scaled_row)[0])
    dec_score   = float(model.decision_function(scaled_row)[0])
    conf_tier   = _confidence_tier(dec_score)
    violations  = _rule_violations(values)
    deviations  = _feature_deviations(values)
    explanation = _natural_language_explanation(deviations)
    shap_vals   = _shap_values_for_row(scaled_row)
    similar     = _similar_normal_records(scaled_row[0])

    return {
        "prediction":    "Anomaly" if prediction == -1 else "Normal",
        "anomaly":       prediction == -1,
        "model_type":    "One-Class SVM",
        "note":          "An anomaly is a statistical flag for review, not proof of wrongdoing.",
        # --- new fields ---
        "decision_score":              round(dec_score, 6),
        "confidence_tier":             conf_tier,
        "rule_violations":             violations,
        "feature_deviations":          deviations,
        "shap_values":                 shap_vals,
        "similar_normal_records":      similar,
        "natural_language_explanation": explanation,
    }


# ---------------------------------------------------------------------------
# POST /api/predict/batch
# ---------------------------------------------------------------------------

@app.post("/api/predict/batch")
def predict_batch(req: BatchRequest):
    if len(req.records) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 records per batch request.")

    results = []
    for idx, record in enumerate(req.records):
        values     = record.model_dump()
        row        = np.array([[values[name] for name in FEATURE_NAMES]], dtype=float)
        scaled_row = scaler.transform(row)
        prediction = int(model.predict(scaled_row)[0])
        dec_score  = float(model.decision_function(scaled_row)[0])
        results.append({
            "index":          idx,
            "prediction":     "Anomaly" if prediction == -1 else "Normal",
            "anomaly":        prediction == -1,
            "decision_score": round(dec_score, 6),
            "confidence_tier": _confidence_tier(dec_score),
            "rule_violations": _rule_violations(values),
        })

    return {"results": results}


# ---------------------------------------------------------------------------
# GET /api/anomaly-heatmap
# ---------------------------------------------------------------------------

@app.get("/api/anomaly-heatmap")
def anomaly_heatmap():
    grp = (
        _df.groupby(["Expense_Category", "Financial_Year"])
        .agg(total=("Anomaly_Label", "count"), flagged=("Anomaly_Label", "sum"))
        .reset_index()
    )
    heatmap = [
        {
            "category":     str(row["Expense_Category"]),
            "year":         str(row["Financial_Year"]),
            "anomaly_rate": round(float(row["flagged"]) / float(row["total"]) * 100, 2) if row["total"] > 0 else 0.0,
            "total":        int(row["total"]),
            "flagged":      int(row["flagged"]),
        }
        for _, row in grp.iterrows()
    ]
    return {"heatmap": heatmap}


# ---------------------------------------------------------------------------
# GET /api/leaderboard
# ---------------------------------------------------------------------------

@app.get("/api/leaderboard")
def leaderboard(limit: int = Query(default=20, ge=1, le=100)):
    grp = (
        _df.groupby("Constituency_ID")
        .agg(
            total_records=("Anomaly_Label", "count"),
            anomaly_count=("Anomaly_Label", "sum"),
            funds_allocated=("Funds_Allocated", "sum"),
            actual_expense=("Actual_Expense", "sum"),
        )
        .reset_index()
    )
    grp["anomaly_rate"] = (grp["anomaly_count"] / grp["total_records"] * 100).round(2)
    grp = grp.sort_values("anomaly_rate", ascending=False).head(limit)

    return {
        "leaderboard": [
            {
                "constituency_id": str(row["Constituency_ID"]),
                "total_records":   int(row["total_records"]),
                "anomaly_count":   int(row["anomaly_count"]),
                "anomaly_rate":    float(row["anomaly_rate"]),
                "funds_allocated": round(float(row["funds_allocated"]), 2),
                "actual_expense":  round(float(row["actual_expense"]), 2),
            }
            for _, row in grp.iterrows()
        ]
    }


# ---------------------------------------------------------------------------
# GET /api/top-anomalous
# ---------------------------------------------------------------------------

@app.get("/api/top-anomalous")
def top_anomalous(limit: int = Query(default=10, ge=1, le=50)):
    sorted_idx = np.argsort(_all_scores)[:limit]
    records = []
    for rank, i in enumerate(sorted_idx, start=1):
        row  = _df.iloc[i]
        rec: dict[str, Any] = {"rank": rank}
        rec["constituency_id"]  = str(row.get("Constituency_ID", ""))
        rec["financial_year"]   = str(row.get("Financial_Year", ""))
        rec["expense_category"] = str(row.get("Expense_Category", ""))
        rec["decision_score"] = float(_all_scores[i])
        rec["anomaly_label"]    = int(row["Anomaly_Label"])
        for feat in FEATURE_NAMES:
            rec[feat] = float(row[feat])
        records.append(rec)
    return {"records": records}


# ---------------------------------------------------------------------------
# GET /api/yearly-spikes
# ---------------------------------------------------------------------------

@app.get("/api/yearly-spikes")
def yearly_spikes():
    # Per-constituency mean and std of Actual_Expense across years
    stats = (
        _df.groupby("Constituency_ID")["Actual_Expense"]
        .agg(mean="mean", std="std")
        .reset_index()
    )
    stats.columns = ["Constituency_ID", "mean_expense", "std_expense"]
    stats["std_expense"] = stats["std_expense"].fillna(0)

    merged = _df[["Constituency_ID", "Financial_Year", "Actual_Expense"]].merge(
        stats, on="Constituency_ID"
    )

    # Flag spikes
    spikes_df = merged[merged["Actual_Expense"] > merged["mean_expense"] + 2 * merged["std_expense"]].copy()
    spikes_df["z_score"] = (
        (spikes_df["Actual_Expense"] - spikes_df["mean_expense"])
        / spikes_df["std_expense"].replace(0, np.nan)
    ).fillna(0).round(4)

    spikes_df = spikes_df.sort_values("z_score", ascending=False).head(50)

    return {
        "spikes": [
            {
                "constituency_id": str(row["Constituency_ID"]),
                "financial_year":  str(row["Financial_Year"]),
                "actual_expense":  round(float(row["Actual_Expense"]), 2),
                "mean_expense":    round(float(row["mean_expense"]), 2),
                "std_expense":     round(float(row["std_expense"]), 2),
                "z_score":         float(row["z_score"]),
            }
            for _, row in spikes_df.iterrows()
        ]
    }


# ---------------------------------------------------------------------------
# GET /api/persistent-anomalies
# ---------------------------------------------------------------------------

@app.get("/api/persistent-anomalies")
def persistent_anomalies():
    anomaly_df = _df[_df["Anomaly_Label"] == 1]

    flagged_years = (
        anomaly_df.groupby("Constituency_ID")["Financial_Year"]
        .nunique()
        .reset_index()
    )
    flagged_years.columns = ["Constituency_ID", "flagged_years"]
    flagged_years = flagged_years[flagged_years["flagged_years"] >= 3]

    total_years_df = (
        _df.groupby("Constituency_ID")["Financial_Year"]
        .nunique()
        .reset_index()
    )
    total_years_df.columns = ["Constituency_ID", "total_years"]

    total_records_df = (
        _df.groupby("Constituency_ID")["Anomaly_Label"]
        .agg(total_records="count", anomaly_count="sum")
        .reset_index()
    )

    flagged_year_list_df = (
        anomaly_df.groupby("Constituency_ID")["Financial_Year"]
        .apply(lambda x: sorted(x.unique().tolist()))
        .reset_index()
    )
    flagged_year_list_df.columns = ["Constituency_ID", "flagged_year_list"]

    merged = (
        flagged_years
        .merge(total_years_df, on="Constituency_ID")
        .merge(total_records_df, on="Constituency_ID")
        .merge(flagged_year_list_df, on="Constituency_ID")
    )
    merged["anomaly_rate"] = (merged["anomaly_count"] / merged["total_records"] * 100).round(2)
    merged = merged.sort_values("flagged_years", ascending=False)

    return {
        "persistent": [
            {
                "constituency_id":  str(row["Constituency_ID"]),
                "flagged_years":    int(row["flagged_years"]),
                "total_years":      int(row["total_years"]),
                "flagged_year_list": [str(y) for y in row["flagged_year_list"]],
                "anomaly_rate":     float(row["anomaly_rate"]),
            }
            for _, row in merged.iterrows()
        ]
    }


# ---------------------------------------------------------------------------
# GET /api/peer-benchmark
# ---------------------------------------------------------------------------

EXPENSE_CATEGORIES = [
    "Education", "Health", "Infrastructure", "Sanitation",
    "Water Supply", "Roads", "Electricity", "Public Safety",
]


@app.get("/api/peer-benchmark")
def peer_benchmark(category: str = Query(...)):
    if category not in EXPENSE_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {EXPENSE_CATEGORIES}",
        )

    cat_df = _df[_df["Expense_Category"] == category]["Cost_Per_Project"]

    if cat_df.empty:
        raise HTTPException(status_code=404, detail="No data found for this category.")

    vals = cat_df.values
    stats = {
        "mean": round(float(np.mean(vals)), 4),
        "std":  round(float(np.std(vals, ddof=0)), 4),
        "p25":  round(float(np.percentile(vals, 25)), 4),
        "p50":  round(float(np.percentile(vals, 50)), 4),
        "p75":  round(float(np.percentile(vals, 75)), 4),
        "p90":  round(float(np.percentile(vals, 90)), 4),
        "p95":  round(float(np.percentile(vals, 95)), 4),
        "p99":  round(float(np.percentile(vals, 99)), 4),
    }

    con_grp = (
        _df[_df["Expense_Category"] == category]
        .groupby("Constituency_ID")["Cost_Per_Project"]
        .mean()
        .reset_index()
    )
    con_grp.columns = ["Constituency_ID", "avg_cost_per_project"]

    # Percentile rank of each constituency's avg within the category distribution
    from scipy.stats import percentileofscore  # type: ignore

    con_grp["percentile"] = con_grp["avg_cost_per_project"].apply(
        lambda v: round(percentileofscore(vals, v), 2)
    )
    con_grp = con_grp.sort_values("percentile", ascending=False).head(20)

    return {
        "category": category,
        "stats": stats,
        "constituency_breakdown": [
            {
                "constituency_id":     str(row["Constituency_ID"]),
                "avg_cost_per_project": round(float(row["avg_cost_per_project"]), 4),
                "percentile":          float(row["percentile"]),
            }
            for _, row in con_grp.iterrows()
        ],
    }


# ---------------------------------------------------------------------------
# POST /api/drift-check
# ---------------------------------------------------------------------------

@app.post("/api/drift-check")
def drift_check(req: DriftRequest):
    if not (1 <= len(req.records) <= 500):
        raise HTTPException(status_code=400, detail="Provide between 1 and 500 records.")

    incoming = np.array(
        [[getattr(r, feat) for feat in FEATURE_NAMES] for r in req.records],
        dtype=float,
    )

    feature_drift = []
    any_drifted   = False
    for i, feat in enumerate(FEATURE_NAMES):
        tr_mean = _feat_means[feat]
        tr_std  = _feat_stds[feat]
        in_mean = float(np.mean(incoming[:, i]))
        deviation_stds = abs(in_mean - tr_mean) / tr_std if tr_std != 0 else 0.0
        drifted = deviation_stds > 2.0
        if drifted:
            any_drifted = True
        feature_drift.append({
            "feature":        feat,
            "training_mean":  round(tr_mean, 4),
            "incoming_mean":  round(in_mean, 4),
            "deviation_stds": round(deviation_stds, 4),
            "drifted":        drifted,
        })

    return {"drift_detected": any_drifted, "feature_drift": feature_drift}


# ---------------------------------------------------------------------------
# GET /api/duplicate-check
# ---------------------------------------------------------------------------

@app.get("/api/duplicate-check")
def duplicate_check():
    grp = (
        _df.groupby(["Constituency_ID", "Financial_Year", "Expense_Category"])
        .size()
        .reset_index(name="count")
    )
    dupes = grp[grp["count"] > 1].sort_values("count", ascending=False)

    return {
        "duplicate_groups": int(len(dupes)),
        "duplicates": [
            {
                "constituency_id":   str(row["Constituency_ID"]),
                "financial_year":    str(row["Financial_Year"]),
                "expense_category":  str(row["Expense_Category"]),
                "count":             int(row["count"]),
            }
            for _, row in dupes.iterrows()
        ],
    }


# ---------------------------------------------------------------------------
# GET /api/stats/features
# ---------------------------------------------------------------------------

@app.get("/api/stats/features")
def feature_stats():
    result: dict[str, dict] = {}
    for feat in FEATURE_NAMES:
        result[feat] = {
            "mean": round(_feat_means[feat], 4),
            "std":  round(_feat_stds[feat],  4),
            "p5":   round(_feat_p5[feat],    4),
            "p95":  round(_feat_p95[feat],   4),
        }
    return {"features": result}


# ---------------------------------------------------------------------------
# Existing read-only dataset endpoint
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def load_dataset() -> pd.DataFrame:
    """LRU-cached dataset (returns the already-loaded global for compatibility)."""
    return _df


@app.get("/api/dashboard")
def dashboard_summary():
    df = _df

    total_records  = len(df)
    anomaly_count  = int((df["Anomaly_Label"] == 1).sum())

    sector_data = (
        df.groupby("Expense_Category", dropna=False)
        .agg(allocated=("Funds_Allocated", "sum"), spent=("Actual_Expense", "sum"))
        .reset_index()
    )
    sector_data["Expense_Category"] = (
        sector_data["Expense_Category"].fillna("Other").astype(str).str.strip()
    )
    sector_data = sector_data.sort_values("Expense_Category")

    project_status = {
        "Completed": int(df["Completed_Projects"].sum()),
        "Pending":   int(df["Pending_Projects"].sum()),
    }

    trend_data = (
        df.groupby("Financial_Year")["Utilisation_Rate"]
        .mean()
        .reset_index()
        .sort_values("Financial_Year")
    )

    yearly_funds = (
        df.groupby("Financial_Year")
        .agg(
            allocated=("Funds_Allocated", "sum"),
            released=("Funds_Released",  "sum"),
            spent=("Actual_Expense",    "sum"),
        )
        .reset_index()
        .sort_values("Financial_Year")
    )

    return {
        "total_records": total_records,
        "anomaly_count": anomaly_count,
        "normal_count":  total_records - anomaly_count,
        "national_totals": {
            "funds_allocated": round(float(df["Funds_Allocated"].sum()), 2),
            "funds_released":  round(float(df["Funds_Released"].sum()),  2),
            "actual_expense":  round(float(df["Actual_Expense"].sum()),  2),
        },
        "yearly_funds": [
            {
                "year":      str(row["Financial_Year"]),
                "allocated": round(float(row["allocated"]), 2),
                "released":  round(float(row["released"]),  2),
                "spent":     round(float(row["spent"]),     2),
            }
            for _, row in yearly_funds.iterrows()
        ],
        "sector_data":    sector_data.to_dict(orient="records"),
        "project_status": [
            {"name": "Completed", "value": project_status["Completed"]},
            {"name": "Pending",   "value": project_status["Pending"]},
        ],
        "utilisation_trend": [
            {
                "year":        str(row["Financial_Year"]),
                "utilisation": round(float(row["Utilisation_Rate"]), 2),
            }
            for _, row in trend_data.iterrows()
        ],
        "data_source": "MPLADS synthetic dataset",
    }


@app.get("/api/constituencies")
def get_constituencies():
    df = _df

    grouped = (
        df.groupby("Constituency_ID")
        .agg(
            district_id=("District_ID", "first"),
            mp_id=("MP_ID", "first"),
            financial_years=("Financial_Year", "nunique"),
            total_records=("Constituency_ID", "size"),
        )
        .reset_index()
        .sort_values("Constituency_ID")
    )

    return {
        "data_source":           "Synthetic dataset",
        "total_constituencies":  len(grouped),
        "constituencies":        grouped.to_dict(orient="records"),
    }


@app.get("/api/constituencies/{constituency_id}")
def get_constituency_details(constituency_id: str):
    df = _df

    selected = df[df["Constituency_ID"].astype(str) == constituency_id].copy()

    if selected.empty:
        raise HTTPException(
            status_code=404,
            detail="No records found for this constituency in the dataset.",
        )

    total_records = len(selected)
    anomaly_count = int((selected["Anomaly_Label"] == 1).sum())

    return {
        "data_source":    "Synthetic dataset",
        "constituency_id": constituency_id,
        "district_id":    str(selected["District_ID"].iloc[0]),
        "mp_id":          str(selected["MP_ID"].iloc[0]),
        "summary": {
            "total_records":              total_records,
            "anomaly_count":              anomaly_count,
            "normal_count":               total_records - anomaly_count,
            "funds_allocated":            round(float(selected["Funds_Allocated"].sum()), 2),
            "funds_released":             round(float(selected["Funds_Released"].sum()),  2),
            "actual_expense":             round(float(selected["Actual_Expense"].sum()),  2),
            "average_utilisation_rate":   round(float(selected["Utilisation_Rate"].mean()), 2),
            "average_literacy_rate":      round(float(selected["Literacy_Rate"].mean()), 2),
            "average_health_index":       round(float(selected["Health_Index"].mean()), 3),
            "average_infrastructure_index": round(float(selected["Infrastructure_Index"].mean()), 3),
            "average_sanitation_index":   round(float(selected["Sanitation_Index"].mean()), 3),
            "completed_projects":         int(selected["Completed_Projects"].sum()),
            "pending_projects":           int(selected["Pending_Projects"].sum()),
        },
        "yearly_data": [
            {
                "financial_year": str(year),
                "records":        int(group.shape[0]),
                "funds_allocated": round(float(group["Funds_Allocated"].sum()), 2),
                "actual_expense":  round(float(group["Actual_Expense"].sum()),  2),
                "utilisation_rate": round(float(group["Utilisation_Rate"].mean()), 2),
                "anomaly_count":   int((group["Anomaly_Label"] == 1).sum()),
            }
            for year, group in selected.groupby("Financial_Year", sort=True)
        ],
        "expense_categories": [
            {
                "category":      str(category),
                "funds_allocated": round(float(group["Funds_Allocated"].sum()), 2),
                "actual_expense":  round(float(group["Actual_Expense"].sum()),  2),
                "anomaly_count":   int((group["Anomaly_Label"] == 1).sum()),
            }
            for category, group in selected.groupby("Expense_Category", sort=True)
        ],
    }


@app.get("/api/official-constituencies")
def get_official_constituencies():
    project_root = Path(__file__).resolve().parent.parent
    data_path = project_root / "data" / "constituencies_master.csv"
    mp_path   = project_root / "data" / "members_of_parliament_2024.csv"

    if not data_path.exists() or not mp_path.exists():
        raise HTTPException(status_code=500, detail="Official reference data files were not found.")

    constituencies = pd.read_csv(data_path).fillna("")
    mps            = pd.read_csv(mp_path).fillna("")

    records = constituencies.merge(
        mps[["state_name", "constituency_name", "mp_2024_id", "mp_name_2024", "party_name_2024", "election_outcome"]],
        on=["state_name", "constituency_name"],
        how="left",
    )

    return {
        "data_source":           "Official 2024 election reference data",
        "financial_data_source": "Synthetic dataset; not actual MPLADS expenditure",
        "total_constituencies":  len(records),
        "constituencies":        records.to_dict(orient="records"),
    }


@app.get("/api/synthetic-finances")
def synthetic_constituency_finances(constituency: str, state: str):
    if not SYNTHETIC_FINANCE_PATH.exists():
        raise HTTPException(status_code=500, detail="Synthetic constituency finance dataset not found.")

    df = pd.read_csv(SYNTHETIC_FINANCE_PATH)

    required_columns = [
        "Constituency", "State", "Financial_Year", "Year",
        "Expense_Category", "Funds_Allocated", "Funds_Released",
        "Actual_Expense", "Project_Count", "Completed_Projects", "Pending_Projects",
    ]
    missing_columns = [c for c in required_columns if c not in df.columns]
    if missing_columns:
        raise HTTPException(status_code=500, detail=f"Dataset is missing columns: {missing_columns}")

    constituency_mask = df["Constituency"].astype(str).str.strip().str.casefold() == constituency.strip().casefold()
    state_mask        = df["State"].astype(str).str.strip().str.casefold()        == state.strip().casefold()

    selected = df[constituency_mask & state_mask].copy()

    if selected.empty:
        raise HTTPException(
            status_code=404,
            detail="No matching synthetic records found for this constituency and state.",
        )

    numeric_columns = ["Funds_Allocated", "Funds_Released", "Actual_Expense", "Project_Count", "Completed_Projects", "Pending_Projects", "Year"]
    for col in numeric_columns:
        selected[col] = pd.to_numeric(selected[col], errors="coerce").fillna(0)

    total_allocated = float(selected["Funds_Allocated"].sum())
    total_released  = float(selected["Funds_Released"].sum())
    total_spent     = float(selected["Actual_Expense"].sum())
    utilisation     = (total_spent / total_released * 100) if total_released > 0 else None

    yearly = (
        selected.groupby(["Financial_Year", "Year"], as_index=False)
        .agg(allocated=("Funds_Allocated", "sum"), released=("Funds_Released", "sum"), spent=("Actual_Expense", "sum"))
        .sort_values("Year")
    )
    yearly_data = [
        {"year": str(row["Financial_Year"]), "allocated": round(float(row["allocated"]), 2), "released": round(float(row["released"]), 2), "spent": round(float(row["spent"]), 2)}
        for _, row in yearly.iterrows()
    ]

    sector = (
        selected.groupby("Expense_Category", as_index=False)
        .agg(allocated=("Funds_Allocated", "sum"), released=("Funds_Released", "sum"), spent=("Actual_Expense", "sum"))
        .sort_values("Expense_Category")
    )
    sector_data = [
        {"sector": str(row["Expense_Category"]), "allocated": round(float(row["allocated"]), 2), "released": round(float(row["released"]), 2), "spent": round(float(row["spent"]), 2)}
        for _, row in sector.iterrows()
    ]

    return {
        "data_source":   "SYNTHETIC DEMONSTRATION ONLY",
        "is_synthetic":  True,
        "constituency":  constituency.strip(),
        "state":         state.strip(),
        "financial_years": len(yearly_data),
        "totals": {
            "funds_allocated": round(total_allocated, 2),
            "funds_released":  round(total_released,  2),
            "actual_expense":  round(total_spent,     2),
            "utilisation_rate": round(utilisation, 2) if utilisation is not None else None,
        },
        "project_status": {
            "completed": int(selected["Completed_Projects"].sum()),
            "pending":   int(selected["Pending_Projects"].sum()),
        },
        "yearly_funds": yearly_data,
        "sector_data":  sector_data,
    }
@app.get("/api/debug/decision-scores")
def debug_decision_scores():
    return {
        "total_scores": int(len(_all_scores)),
        "unique_scores": int(len(np.unique(np.round(_all_scores, 8)))),
        "minimum": float(np.min(_all_scores)),
        "maximum": float(np.max(_all_scores)),
        "standard_deviation": float(np.std(_all_scores)),
        "first_15": [
            float(x) for x in np.sort(_all_scores)[:15]
        ]
    }