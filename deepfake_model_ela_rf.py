"""
FastAPI backend for the ELA + Random Forest deepfake detector.

Uploads are processed with Error Level Analysis (ELA), features are scaled and
scored by the trained RandomForest model, and the response includes:
  * fake/real probabilities
  * the original image with top suspicious regions outlined (red boxes)
  * an ELA heatmap and the heatmap with boxes

Model artifacts expected in `feature_model_output/`:
  - random_forest_model.pkl
  - feature_scaler.pkl
  - feature_config.json

Run:
    uvicorn deepfake_model_ela_rf:app --reload --port 8000
"""
from __future__ import annotations

import base64
import io
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, UnidentifiedImageError
from scipy import ndimage
from scipy.ndimage import binary_opening, find_objects

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
MODEL_DIR = PROJECT_ROOT / "feature_model_output"
MODEL_PATH = MODEL_DIR / "random_forest_model.pkl"
SCALER_PATH = MODEL_DIR / "feature_scaler.pkl"
CONFIG_PATH = MODEL_DIR / "feature_config.json"

TOP_N_BOXES = 10


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
@dataclass
class ElaConfig:
    ela_quality: int
    threshold_multiplier: float
    min_region_size: int
    enhancement_strength: float
    feature_names: List[str]


def _load_artifacts() -> tuple[Any, Any, ElaConfig]:
    if not (MODEL_PATH.exists() and SCALER_PATH.exists() and CONFIG_PATH.exists()):
        raise RuntimeError(
            "Model artifacts missing. Expected random_forest_model.pkl, feature_scaler.pkl, feature_config.json under feature_model_output/."
        )
    rf_model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)
    ela_cfg = ElaConfig(
        ela_quality=config["ela_quality"],
        threshold_multiplier=config["threshold_multiplier"],
        min_region_size=config["min_region_size"],
        enhancement_strength=config["enhancement_strength"],
        feature_names=config.get("feature_names", []),
    )
    return rf_model, scaler, ela_cfg


RF_MODEL, SCALER, ELA_CFG = _load_artifacts()


# ---------------------------------------------------------------------------
# ELA + feature extraction
# ---------------------------------------------------------------------------
def perform_ela(img: Image.Image, quality: int, enhancement: float) -> np.ndarray:
    buffer = io.BytesIO()
    img.save(buffer, "JPEG", quality=quality)
    buffer.seek(0)
    compressed = Image.open(buffer)

    ela = ImageChops.difference(img, compressed)
    extrema = ela.getextrema()
    max_diff = max([ex[1] for ex in extrema]) or 1
    scale = 255.0 / max_diff

    ela = ImageEnhance.Brightness(ela).enhance(scale)
    ela = ImageEnhance.Brightness(ela).enhance(enhancement)
    ela = ImageEnhance.Contrast(ela).enhance(enhancement)
    return np.array(ela.convert("L"))


def find_suspicious_regions(ela_array: np.ndarray, threshold: float, min_area: int = 50):
    suspicious_mask = ela_array > threshold
    num_suspicious = int(np.sum(suspicious_mask))

    if num_suspicious == 0:
        return [], [], []

    noise_threshold_pct = 15
    if (num_suspicious / ela_array.size * 100) > noise_threshold_pct:
        structure = np.ones((2, 2))
        suspicious_mask = binary_opening(suspicious_mask, structure=structure, iterations=1)

    labeled_array, num_features = ndimage.label(suspicious_mask)
    if num_features == 0:
        return [], [], []

    if num_features > 1000:
        slices = find_objects(labeled_array)
        boxes: List[Tuple[int, int, int, int]] = []
        region_sizes: List[int] = []
        region_intensities: List[float] = []
        for i, slice_obj in enumerate(slices, 1):
            if slice_obj is None:
                continue
            region_mask = labeled_array[slice_obj] == i
            region_size = int(np.sum(region_mask))
            if region_size < min_area:
                continue
            y_slice, x_slice = slice_obj
            y_min, y_max = y_slice.start, y_slice.stop
            x_min, x_max = x_slice.start, x_slice.stop
            width, height = x_max - x_min, y_max - y_min
            if width > 10 and height > 10:
                boxes.append((x_min, y_min, width, height))
                region_sizes.append(region_size)
                region_values = ela_array[slice_obj][region_mask]
                region_intensities.append(float(np.mean(region_values)))
    else:
        boxes = []
        region_sizes = []
        region_intensities = []
        for i in range(1, num_features + 1):
            coords = np.argwhere(labeled_array == i)
            if len(coords) < min_area:
                continue
            y_min, x_min = coords.min(axis=0)
            y_max, x_max = coords.max(axis=0)
            width, height = x_max - x_min, y_max - y_min
            if width > 10 and height > 10:
                boxes.append((int(x_min), int(y_min), int(width), int(height)))
                region_sizes.append(int(len(coords)))
                region_values = ela_array[labeled_array == i]
                region_intensities.append(float(np.mean(region_values)))

    return boxes, region_sizes, region_intensities


def extract_features(pil_img: Image.Image):
    ela_array = perform_ela(pil_img, quality=ELA_CFG.ela_quality, enhancement=ELA_CFG.enhancement_strength)

    mean_error = float(np.mean(ela_array))
    max_error = float(np.max(ela_array))
    std_error = float(np.std(ela_array))
    median_error = float(np.median(ela_array))
    threshold = mean_error + (ELA_CFG.threshold_multiplier * std_error)

    suspicious_pixels = int(np.sum(ela_array > threshold))
    suspicious_percentage = (suspicious_pixels / ela_array.size) * 100

    boxes, region_sizes, region_intensities = find_suspicious_regions(
        ela_array, threshold, min_area=ELA_CFG.min_region_size
    )
    num_regions = len(boxes)
    avg_region_size = float(np.mean(region_sizes)) if region_sizes else 0.0
    max_region_size = float(np.max(region_sizes)) if region_sizes else 0.0
    avg_region_intensity = float(np.mean(region_intensities)) if region_intensities else 0.0
    region_size_std = float(np.std(region_sizes)) if region_sizes else 0.0

    hist, _ = np.histogram(ela_array, bins=10, range=(0, 255))
    hist_norm = hist / ela_array.size
    p25, p50, p75, p90, p95 = np.percentile(ela_array, [25, 50, 75, 90, 95])
    edges_h = float(np.abs(np.diff(ela_array, axis=0)).sum())
    edges_v = float(np.abs(np.diff(ela_array, axis=1)).sum())

    features = np.concatenate(
        [
            [mean_error, max_error, std_error, median_error, threshold, suspicious_pixels, suspicious_percentage],
            [num_regions, avg_region_size, max_region_size, avg_region_intensity, region_size_std],
            hist_norm,
            [p25, p50, p75, p90, p95],
            [edges_h, edges_v],
        ]
    )

    feature_dict = {
        "mean_error": mean_error,
        "max_error": max_error,
        "std_error": std_error,
        "median_error": median_error,
        "threshold": threshold,
        "suspicious_pixels": suspicious_pixels,
        "suspicious_percentage": suspicious_percentage,
        "num_regions": num_regions,
    }

    return features, ela_array, threshold, boxes, feature_dict


# ---------------------------------------------------------------------------
# Visualization helpers
# ---------------------------------------------------------------------------
def _to_data_url(img: Image.Image, fmt: str = "PNG") -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
    mime = "image/png" if fmt.upper() == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{encoded}"


def _draw_boxes_on_image(img: Image.Image, boxes: List[Tuple[int, int, int, int]]):
    out = img.copy()
    draw = ImageDraw.Draw(out)
    for box in boxes:
        x, y, w, h = box
        draw.rectangle([x, y, x + w, y + h], outline="red", width=5)
    return out


def _ela_heatmap_image(ela_array: np.ndarray) -> Image.Image:
    # Normalize to 0..255
    ptp_val = np.ptp(ela_array)
    normalized = (ela_array - ela_array.min()) / (ptp_val or 1)
    import matplotlib.cm as cm

    colormap = cm.get_cmap("jet")
    colored = (colormap(normalized)[:, :, :3] * 255).astype(np.uint8)
    return Image.fromarray(colored)


# ---------------------------------------------------------------------------
# FastAPI setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Deepfake ELA+RF Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/analyze")
async def analyze_image(image: UploadFile = File(...)):
    contents = await image.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Unsupported or corrupted image upload.") from exc

    features, ela_array, threshold, boxes, feature_dict = extract_features(pil_img)
    if features is None:
        raise HTTPException(status_code=500, detail="Failed to extract features from image.")

    features_scaled = SCALER.transform(features.reshape(1, -1))
    pred = RF_MODEL.predict(features_scaled)[0]
    proba = RF_MODEL.predict_proba(features_scaled)[0]
    real_prob = float(proba[0])
    fake_prob = float(proba[1])
    is_fake = bool(pred == 1)

    # Select top-N largest boxes for visualization
    boxes_with_sizes = list(zip(boxes, [b[2] * b[3] for b in boxes]))
    boxes_sorted = sorted(boxes_with_sizes, key=lambda x: x[1], reverse=True)
    top_boxes = [b for b, _ in boxes_sorted[:TOP_N_BOXES]]

    original_with_boxes = _draw_boxes_on_image(pil_img, top_boxes)
    ela_heatmap = _ela_heatmap_image(ela_array)
    ela_with_boxes = _draw_boxes_on_image(ela_heatmap, top_boxes)

    preview_data_url = _to_data_url(pil_img, fmt="PNG")

    response = {
        "image_panel": {
            "filename": image.filename,
            "preview_data_url": preview_data_url,
        },
        "analysis_panel": {
            "label": "FAKE" if is_fake else "REAL",
            "probabilities": {"real": real_prob, "fake": fake_prob},
            "fake_probability": fake_prob,
            "is_fake": is_fake,
        },
        "explainability": {
            "original_with_boxes": _to_data_url(original_with_boxes),
            "ela_heatmap": _to_data_url(ela_heatmap),
            "ela_with_boxes": _to_data_url(ela_with_boxes),
            "top_boxes": top_boxes,
            "threshold": threshold,
            "feature_summary": feature_dict,
        },
    }
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("deepfake_model_ela_rf:app", host="0.0.0.0", port=8000, reload=True)
