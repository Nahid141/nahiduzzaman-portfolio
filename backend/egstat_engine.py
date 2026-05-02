"""
EGStat-N Web Engine
Epidemiological, Genomics and Statistical Analysis Tool for Networks

Author: FNU Nahiduzzaman
Motto: "Let's fly over the ocean of Data"

This file contains backend analysis functions only.
No Tkinter GUI code should be used in the web version.
"""

from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import math
import os
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


APP_TITLE = "EGStat-N — Epidemiological, Genomics and Statistical Analysis Tool"
APP_CREDIT = "Created by FNU Nahiduzzaman"
APP_VERSION = "Web v1.0"
APP_MOTTO = "Let's fly over the ocean of Data"


ABOUT_TEXT = {
    "title": APP_TITLE,
    "version": APP_VERSION,
    "author": APP_CREDIT,
    "motto": APP_MOTTO,
    "purpose": [
        "Epidemiological data analysis",
        "SEIR-based disease dynamics",
        "Statistical tests",
        "Risk factor analysis",
        "Network analysis",
        "Genomics and molecular data support",
        "Downloadable web-based outputs",
    ],
}


@dataclass
class EGStatConfig:
    app_title: str = APP_TITLE
    author: str = APP_CREDIT
    version: str = APP_VERSION
    motto: str = APP_MOTTO
    infectious_period_days: float = 14.0
    analysis_include_title: bool = True
    analysis_dpi: int = 300
    save_csv: bool = True
    save_txt: bool = False
    save_tiff: bool = False
    save_jpg: bool = False
    map_title: bool = True
    map_dpi: int = 600
    map_prev_cmap: str = "Reds"
    map_ar_cmap: str = "Blues"
    map_district_col: str = "District"
    map_show_farms: bool = True
    regression_type: str = "logistic"
    pvalue_threshold: float = 0.2
    confidence_level: float = 0.95
    test_size: float = 0.3
    cv_folds: int = 5


@dataclass
class ObsRow:
    Farm_ID: str = ""
    Location: str = ""
    Latitude: float = 0.0
    Longitude: float = 0.0
    Date: str = ""
    Observation: int = 0
    Total_Animals: int = 0
    S: int = 0
    E: int = 0
    I: int = 0
    R: int = 0
    RBPT_Positive: int = 0
    iELISA_Positive: int = 0
    Abortion_Count: int = 0
    Pending_Culled: int = 0
    Culled: int = 0
    Pending_Quarantined: int = 0
    Quarantined: int = 0
    New_Animals_Moved_In: int = 0
    New_Animals_Moved_Out: int = 0
    Susceptible_In_From_MovedIn: int = 0
    Susceptible_Out_From_MovedOut: int = 0


@dataclass
class FarmSetup:
    farm_id: str = ""
    location: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    start_date: str = datetime.today().strftime("%Y-%m-%d")
    init_total_animals: int = 100
    init_e: int = 0
    init_i: int = 0
    init_r: int = 0
    init_rbpt_positive: int = 0
    init_ielisa_positive: int = 0
    init_pending_culled: int = 0


@dataclass
class ObservationInput:
    date: str = datetime.today().strftime("%Y-%m-%d")
    e: int = 0
    rbpt_positive: int = 0
    ielisa_positive: int = 0
    abortions: int = 0
    moved_in: int = 0
    moved_out: int = 0
    pending_culled: int = 0


@dataclass
class RiskAnalysisConfig:
    dependent_variable: Optional[str] = None
    independent_variables: Optional[List[str]] = None
    regression_type: str = "logistic"
    pvalue_threshold: float = 0.2
    confidence_level: float = 0.95
    selected_models: Optional[List[str]] = None
    test_size: float = 0.3
    cv_folds: int = 5


def safe_int(val: Any, default: int = 0) -> int:
    try:
        if val is None:
            return default
        if isinstance(val, str) and val.strip() == "":
            return default
        return int(float(val))
    except Exception:
        return default


def safe_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        if isinstance(val, str) and val.strip() == "":
            return default
        return float(val)
    except Exception:
        return default


def today() -> str:
    return datetime.today().strftime("%Y-%m-%d")


def wilson_ci(k: int, n: int, z: float = 1.96) -> Tuple[float, float]:
    if n <= 0:
        return 0.0, 0.0

    phat = k / n
    denom = 1 + (z**2) / n
    centre = phat + (z**2) / (2 * n)
    root = z * math.sqrt((phat * (1 - phat) + (z**2) / (4 * n)) / n)

    lower = (centre - root) / denom
    upper = (centre + root) / denom

    return max(0.0, lower), min(1.0, upper)


def log_reg_slope(y: List[float]) -> Tuple[float, float]:
    ys = np.array(y, dtype=float)
    mask = ys > 0

    if mask.sum() < 2:
        return float("nan"), float("nan")

    t = np.arange(len(ys))[mask].astype(float)
    ly = np.log(ys[mask])

    matrix = np.vstack([t, np.ones_like(t)]).T
    slope, intercept = np.linalg.lstsq(matrix, ly, rcond=None)[0]

    return float(slope), float(intercept)


def calculate_incidence_rate(
    new_cases: float,
    population_at_risk: float,
    time_period: float = 1,
) -> float:
    if population_at_risk <= 0:
        return float("nan")
    return (new_cases / population_at_risk) * time_period


def calculate_mortality_rate(deaths: float, total_population: float) -> float:
    if total_population <= 0:
        return float("nan")
    return deaths / total_population


def calculate_case_fatality_rate(deaths: float, total_cases: float) -> float:
    if total_cases <= 0:
        return float("nan")
    return deaths / total_cases


def load_dataset(input_path: str) -> pd.DataFrame:
    ext = os.path.splitext(input_path)[1].lower()

    if ext == ".csv":
        return pd.read_csv(input_path)

    if ext in [".xlsx", ".xls"]:
        return pd.read_excel(input_path)

    if ext == ".txt":
        return pd.read_csv(input_path, sep=None, engine="python")

    raise ValueError("Unsupported file type. Please upload CSV, Excel, or TXT file.")


def generate_basic_summary(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "column": df.columns,
            "dtype": [str(df[col].dtype) for col in df.columns],
            "missing_values": [int(df[col].isna().sum()) for col in df.columns],
            "unique_values": [int(df[col].nunique()) for col in df.columns],
        }
    )


def analyze_dataset(input_path: str, output_dir: str) -> Dict[str, Any]:
    os.makedirs(output_dir, exist_ok=True)

    df = load_dataset(input_path)
    summary = generate_basic_summary(df)

    output_file = "egstat_basic_summary.csv"
    output_path = os.path.join(output_dir, output_file)
    summary.to_csv(output_path, index=False)

    return {
        "message": "EGStat-N web analysis completed",
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "output_file": output_file,
        "available_modules": [
            "basic_summary",
            "epidemiological_calculations",
            "wilson_confidence_interval",
            "incidence_rate",
            "mortality_rate",
            "case_fatality_rate",
        ],
    }


class EGStatWebSession:
    """
    Web-session replacement for the old Tkinter EGStatNApp class.

    This stores analysis state and module settings only.
    Next.js handles the UI, and FastAPI routes call these backend methods.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.config = EGStatConfig()
        self.observations: List[Dict[str, Any]] = []
        self.farm_ids: set[str] = set()
        self.current_farm: str = ""
        self.last_analysis: Dict[str, Any] = {}
        self.shapefile_gdf = None
        self.shapefile_district_col: str = "District"
        self.risk_data = None
        self.risk_results: Dict[str, Any] = {}
        self.ml_results: Dict[str, Any] = {}

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "app": asdict(self.config),
            "about": ABOUT_TEXT,
            "modules": [
                "Transmission Dynamics",
                "Statistical Tests",
                "Risk Factor Analysis",
                "Machine Learning",
                "Network Analysis",
                "Meta-Analysis",
                "Genomic & Molecular Analysis",
            ],
        }

    def get_available_modules(self) -> Dict[str, Any]:
        return {
            "transmission_dynamics": [
                "Farm Setup",
                "Observation Entry",
                "Data Table",
                "Trend Analysis",
                "Maps",
            ],
            "risk_factor_analysis": [
                "Data Input",
                "Univariable Analysis",
                "Multivariable Analysis",
                "Regression Export",
            ],
            "machine_learning": [
                "XGBoost",
                "Random Forest",
                "Logistic Regression",
                "SVM",
                "Decision Tree",
                "Lasso",
            ],
            "other_modules": [
                "Network Analysis",
                "Meta-Analysis",
                "Genomic & Molecular Analysis",
            ],
        }

    def set_current_farm(self, farm_id: str) -> Dict[str, Any]:
        if farm_id not in self.farm_ids:
            return {
                "success": False,
                "message": f"Farm ID '{farm_id}' not found",
            }

        self.current_farm = farm_id

        return {
            "success": True,
            "current_farm": self.current_farm,
        }

    def add_farm(self, farm: FarmSetup) -> Dict[str, Any]:
        if not farm.farm_id:
            return {
                "success": False,
                "message": "Farm ID is required",
            }

        self.farm_ids.add(farm.farm_id)

        observation = {
            "Farm_ID": farm.farm_id,
            "Location": farm.location,
            "Latitude": farm.latitude,
            "Longitude": farm.longitude,
            "Date": farm.start_date,
            "Observation": 1,
            "Total_Animals": farm.init_total_animals,
            "E": farm.init_e,
            "I": farm.init_i,
            "R": farm.init_r,
            "RBPT_Positive": farm.init_rbpt_positive,
            "iELISA_Positive": farm.init_ielisa_positive,
            "Pending_Culled": farm.init_pending_culled,
        }

        observation["S"] = max(
            0,
            farm.init_total_animals - (farm.init_e + farm.init_i + farm.init_r),
        )

        self.observations.append(observation)
        self.current_farm = farm.farm_id

        return {
            "success": True,
            "message": "Farm setup added successfully",
            "farm_id": farm.farm_id,
            "observation": observation,
        }

    def add_observation(self, farm_id: str, obs: ObservationInput) -> Dict[str, Any]:
        if farm_id not in self.farm_ids:
            return {
                "success": False,
                "message": f"Farm ID '{farm_id}' not found",
            }

        farm_observations = [
            item for item in self.observations if item["Farm_ID"] == farm_id
        ]

        previous = farm_observations[-1] if farm_observations else None

        total_animals = previous["Total_Animals"] if previous else 0
        total_animals = total_animals + obs.moved_in - obs.moved_out

        record = {
            "Farm_ID": farm_id,
            "Date": obs.date,
            "Observation": len(farm_observations) + 1,
            "Total_Animals": total_animals,
            "E": obs.e,
            "I": obs.ielisa_positive,
            "R": 0,
            "RBPT_Positive": obs.rbpt_positive,
            "iELISA_Positive": obs.ielisa_positive,
            "Abortion_Count": obs.abortions,
            "New_Animals_Moved_In": obs.moved_in,
            "New_Animals_Moved_Out": obs.moved_out,
            "Pending_Culled": obs.pending_culled,
        }

        record["S"] = max(
            0,
            total_animals - (record["E"] + record["I"] + record["R"]),
        )

        self.observations.append(record)

        return {
            "success": True,
            "message": "Observation added successfully",
            "record": record,
        }

    def get_observations(self) -> Dict[str, Any]:
        return {
            "success": True,
            "count": len(self.observations),
            "observations": self.observations,
        }

    def calculate_epidemiological_summary(self) -> Dict[str, Any]:
        if not self.observations:
            return {
                "success": False,
                "message": "No observations available",
            }

        df = pd.DataFrame(self.observations)

        total_animals = int(df["Total_Animals"].iloc[-1]) if "Total_Animals" in df else 0
        total_i = int(df["I"].sum()) if "I" in df else 0
        total_abortions = int(df["Abortion_Count"].sum()) if "Abortion_Count" in df else 0

        prevalence = total_i / total_animals if total_animals > 0 else float("nan")
        abortion_rate = total_abortions / total_animals if total_animals > 0 else float("nan")
        ci_low, ci_high = wilson_ci(total_i, total_animals)

        result = {
            "success": True,
            "total_observations": int(len(df)),
            "total_animals_latest": total_animals,
            "total_infected": total_i,
            "total_abortions": total_abortions,
            "prevalence": prevalence,
            "prevalence_ci_low": ci_low,
            "prevalence_ci_high": ci_high,
            "abortion_rate": abortion_rate,
        }

        self.last_analysis["epidemiological_summary"] = result
        return result
def preprocess_data_for_ml(df: pd.DataFrame, dependent_var: str, independent_vars: List[str]):
    data = df[[dependent_var] + independent_vars].dropna().copy()

    y = data[dependent_var]
    X = data[independent_vars]

    if y.dtype == "object":
        y = pd.factorize(y)[0]

    X_encoded = pd.get_dummies(X, drop_first=True)
    X_encoded = X_encoded.apply(pd.to_numeric, errors="coerce").fillna(0)

    return X_encoded, np.array(y)


def run_individual_predictive_models(
    df: pd.DataFrame,
    dependent_var: str,
    independent_vars: List[str],
    output_dir: str,
    test_size: float = 0.3,
    random_state: int = 42,
) -> Dict[str, Any]:
    from sklearn.model_selection import train_test_split, cross_val_score
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import SVC
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.metrics import (
        accuracy_score,
        precision_score,
        recall_score,
        f1_score,
        roc_auc_score,
        confusion_matrix,
    )

    os.makedirs(output_dir, exist_ok=True)

    try:
        import xgboost as xgb
        has_xgb = True
    except Exception:
        has_xgb = False

    models = {
        "Logistic Regression": LogisticRegression(max_iter=1000, random_state=random_state),
        "Random Forest": RandomForestClassifier(n_estimators=100, random_state=random_state),
        "SVM": SVC(probability=True, random_state=random_state),
        "Decision Tree": DecisionTreeClassifier(random_state=random_state),
    }

    if has_xgb:
        models["XGBoost"] = xgb.XGBClassifier(random_state=random_state, eval_metric="logloss")

    all_results = []
    best_model_info = None
    best_accuracy = -1

    for var in independent_vars:
        try:
            X_encoded, y_encoded = preprocess_data_for_ml(df, dependent_var, [var])

            if X_encoded.empty or len(np.unique(y_encoded)) < 2:
                all_results.append({
                    "variable": var,
                    "status": "skipped",
                    "reason": "Insufficient data or target has only one class",
                })
                continue

            X_train, X_test, y_train, y_test = train_test_split(
                X_encoded,
                y_encoded,
                test_size=test_size,
                random_state=random_state,
                stratify=y_encoded,
            )

            for model_name, model in models.items():
                try:
                    model.fit(X_train, y_train)
                    y_pred = model.predict(X_test)

                    if hasattr(model, "predict_proba"):
                        y_pred_proba = model.predict_proba(X_test)[:, 1]
                    else:
                        y_pred_proba = None

                    accuracy = accuracy_score(y_test, y_pred)
                    precision = precision_score(y_test, y_pred, average="weighted", zero_division=0)
                    recall = recall_score(y_test, y_pred, average="weighted", zero_division=0)
                    f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)

                    if y_pred_proba is not None and len(np.unique(y_test)) == 2:
                        auc_roc = roc_auc_score(y_test, y_pred_proba)
                    else:
                        auc_roc = float("nan")

                    try:
                        cv_scores = cross_val_score(model, X_encoded, y_encoded, cv=5)
                        cv_mean = float(np.mean(cv_scores))
                    except Exception:
                        cv_mean = float("nan")

                    cm = confusion_matrix(y_test, y_pred).tolist()

                    row = {
                        "variable": var,
                        "model": model_name,
                        "accuracy": float(accuracy),
                        "precision": float(precision),
                        "recall": float(recall),
                        "f1": float(f1),
                        "auc_roc": float(auc_roc) if not np.isnan(auc_roc) else None,
                        "cv_mean": float(cv_mean) if not np.isnan(cv_mean) else None,
                        "confusion_matrix": cm,
                        "status": "success",
                    }

                    all_results.append(row)

                    if accuracy > best_accuracy:
                        best_accuracy = accuracy
                        best_model_info = {
                            "variable": var,
                            "model": model_name,
                            "accuracy": float(accuracy),
                            "y_test": y_test,
                            "y_pred": y_pred,
                            "y_pred_proba": y_pred_proba,
                        }

                except Exception as model_error:
                    all_results.append({
                        "variable": var,
                        "model": model_name,
                        "status": "failed",
                        "error": str(model_error),
                    })

        except Exception as var_error:
            all_results.append({
                "variable": var,
                "status": "failed",
                "error": str(var_error),
            })

    results_df = pd.DataFrame(all_results)
    output_csv = "egstat_ml_individual_results.csv"
    output_csv_path = os.path.join(output_dir, output_csv)
    results_df.to_csv(output_csv_path, index=False)

    plot_file = create_ml_summary_plot(results_df, output_dir)

    return {
        "success": True,
        "message": "Individual predictive modeling completed",
        "results": all_results,
        "best_model": {
            "variable": best_model_info["variable"],
            "model": best_model_info["model"],
            "accuracy": best_model_info["accuracy"],
        } if best_model_info else None,
        "output_file": output_csv,
        "plot_file": plot_file,
    }


def create_ml_summary_plot(results_df: pd.DataFrame, output_dir: str) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    success_df = results_df[results_df["status"] == "success"].copy()

    output_plot = "egstat_ml_summary_plot.png"
    output_path = os.path.join(output_dir, output_plot)

    if success_df.empty:
        fig, ax = plt.subplots(figsize=(8, 5))
        ax.text(0.5, 0.5, "No successful ML results", ha="center", va="center")
        ax.axis("off")
        fig.savefig(output_path, dpi=300, bbox_inches="tight")
        plt.close(fig)
        return output_plot

    pivot = success_df.pivot_table(
        index="variable",
        columns="model",
        values="accuracy",
        aggfunc="mean",
    )

    fig, ax = plt.subplots(figsize=(12, 7))
    pivot.plot(kind="bar", ax=ax)

    ax.set_title("EGStat-N ML Accuracy by Variable and Model", fontsize=14, fontweight="bold")
    ax.set_xlabel("Variable")
    ax.set_ylabel("Accuracy")
    ax.set_ylim(0, 1)
    ax.grid(axis="y", alpha=0.3)
    ax.legend(title="Model", bbox_to_anchor=(1.02, 1), loc="upper left")

    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    fig.savefig(output_path, dpi=300, bbox_inches="tight")
    plt.close(fig)

    return output_plot


def run_multivariable_logistic_analysis(
    df: pd.DataFrame,
    dependent_var: str,
    independent_vars: List[str],
    output_dir: str,
    confidence_level: float = 0.95,
) -> Dict[str, Any]:
    import statsmodels.api as sm
    from scipy import stats

    os.makedirs(output_dir, exist_ok=True)

    X_encoded, y_encoded = preprocess_data_for_ml(df, dependent_var, independent_vars)

    if X_encoded.empty:
        return {
            "success": False,
            "message": "No usable independent variables after preprocessing",
        }

    corr_matrix = X_encoded.corr().abs()
    upper_triangle = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
    high_corr_vars = [
        column for column in upper_triangle.columns
        if any(upper_triangle[column] > 0.9)
    ]

    if high_corr_vars:
        X_encoded = X_encoded.drop(columns=high_corr_vars)

    if X_encoded.empty:
        return {
            "success": False,
            "message": "All variables removed due to high correlation",
            "removed_variables": high_corr_vars,
        }

    X_with_const = sm.add_constant(X_encoded, has_constant="add")

    results_dict = {}

    try:
        model = sm.Logit(y_encoded, X_with_const)
        result = model.fit(disp=False, maxiter=1000)
        results_dict["standard"] = result
    except Exception:
        try:
            model = sm.Logit(y_encoded, X_with_const)
            result = model.fit_regularized(alpha=0.1, disp=False, maxiter=1000)
            results_dict["regularized"] = result
        except Exception as error:
            return {
                "success": False,
                "message": "Logistic regression failed",
                "error": str(error),
            }

    method_used = list(results_dict.keys())[0]
    result = results_dict[method_used]

    alpha = 1 - confidence_level
    z_value = stats.norm.ppf(1 - alpha / 2)

    output_results = []

    for var in result.params.index:
        if var == "const":
            continue

        coef = float(result.params[var])
        odds_ratio = float(np.exp(coef))

        if hasattr(result, "bse") and var in result.bse:
            std_error = float(result.bse[var])
            ci_lower = float(np.exp(coef - z_value * std_error))
            ci_upper = float(np.exp(coef + z_value * std_error))
        else:
            std_error = None
            ci_lower = None
            ci_upper = None

        if hasattr(result, "pvalues") and var in result.pvalues:
            p_value = float(result.pvalues[var])
        else:
            p_value = None

        output_results.append({
            "variable": var,
            "coefficient": coef,
            "odds_ratio": odds_ratio,
            "ci_lower": ci_lower,
            "ci_upper": ci_upper,
            "p_value": p_value,
            "std_error": std_error,
        })

    output_df = pd.DataFrame(output_results)

    output_csv = "egstat_multivariable_logistic_results.csv"
    output_csv_path = os.path.join(output_dir, output_csv)
    output_df.to_csv(output_csv_path, index=False)

    plot_file = create_odds_ratio_plot(output_df, output_dir)

    return {
        "success": True,
        "message": "Multivariable logistic analysis completed",
        "method_used": method_used,
        "removed_high_correlation_variables": high_corr_vars,
        "n_observations": int(len(y_encoded)),
        "n_variables": int(len(output_results)),
        "results": output_results,
        "output_file": output_csv,
        "plot_file": plot_file,
    }


def create_odds_ratio_plot(results_df: pd.DataFrame, output_dir: str) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    output_plot = "egstat_odds_ratio_plot.png"
    output_path = os.path.join(output_dir, output_plot)

    if results_df.empty:
        fig, ax = plt.subplots(figsize=(8, 5))
        ax.text(0.5, 0.5, "No logistic regression results", ha="center", va="center")
        ax.axis("off")
        fig.savefig(output_path, dpi=300, bbox_inches="tight")
        plt.close(fig)
        return output_plot

    plot_df = results_df.dropna(subset=["odds_ratio"]).copy()
    plot_df = plot_df.sort_values("odds_ratio")

    fig, ax = plt.subplots(figsize=(10, max(5, len(plot_df) * 0.5)))

    ax.scatter(plot_df["odds_ratio"], plot_df["variable"], s=70)

    for _, row in plot_df.iterrows():
        if pd.notna(row.get("ci_lower")) and pd.notna(row.get("ci_upper")):
            ax.plot(
                [row["ci_lower"], row["ci_upper"]],
                [row["variable"], row["variable"]],
                linewidth=2,
            )

    ax.axvline(1, linestyle="--", linewidth=1)
    ax.set_xscale("log")
    ax.set_xlabel("Odds Ratio (log scale)")
    ax.set_ylabel("Variable")
    ax.set_title("EGStat-N Multivariable Logistic Regression", fontweight="bold")
    ax.grid(axis="x", alpha=0.3)

    plt.tight_layout()
    fig.savefig(output_path, dpi=300, bbox_inches="tight")
    plt.close(fig)

    return output_plot