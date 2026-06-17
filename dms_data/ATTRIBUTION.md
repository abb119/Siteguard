# DMS two-model dataset — sources, licenses & harmonization

Two Ultralytics YOLO detectors are built **only from public internet datasets**
(no self-recorded video):

| Model | File | Classes |
|---|---|---|
| **A — cabin** | `dms_cabin.pt` | `0 phone` · `1 bottle` · `2 cup` |
| **B — seatbelt** | `seatbelt.pt` | `0 belt_on` · `1 belt_off` |

The box for the seatbelt model marks the **occupant torso/shoulder region**
(belt_on = diagonal belt band visible; belt_off = no visible band), not a
physical strap object.

---

## Model A — cabin (phone / bottle / cup)

| Source | Access | License | Use & mapping |
|---|---|---|---|
| **COCO 2017** (subset) | `images.cocodataset.org` (no auth) | Images: Flickr terms; annotations: **CC BY 4.0** | classes *cell phone→phone*, *bottle→bottle*, *cup→cup*. Up to 4000 train / 1000 val images **containing** these classes, prioritising the rarer phone & cup. |
| **State Farm Distracted Driver** (real cabin, via repo `datasets/dms_cabin`) | Kaggle mirror (already in repo) | Kaggle competition data — research/educational use | Real in-cabin **phone** frames only. We keep an image **only if all its boxes are phone** (the old set's *drinking* class can't be split into bottle/cup, so any drinking frame is dropped to avoid unlabelled cups). Capped to 2000 images. |

COCO gives clean object boxes for all three classes; the State Farm phones add
real driver-cabin context (held near hand/face) that COCO's scene-scale phones
lack.

> Citation — COCO: T.-Y. Lin et al., *Microsoft COCO: Common Objects in
> Context*, ECCV 2014.

---

## Model B — seatbelt (belt_on / belt_off)

The DMS runs on an **interior, driver-facing webcam**. We inspected every
candidate visually and kept only **interior, (near-)frontal occupant** sources;
exterior traffic-enforcement sets were rejected (see below).

| Source (Roboflow Universe) | Version | License | Mapping (verified vs `data.yaml`) |
|---|---|---|---|
| `fyp-atxxb/seatbelt-dataset-pztwp` | latest | **CC BY 4.0** | `data.yaml` order `['non-seatbelt','seatbelt']` → **{0→belt_off, 1→belt_on}** |
| `seatbelttraining-7yh0f/seatbelt-detection-lb1ec` | latest | **CC BY 4.0** | `data.yaml` order `['no-seatbelt','seatbelt']` → **{0→belt_off, 1→belt_on}** |

**Rejected after visual inspection (wrong viewpoint for an interior DMS — they
reproduce the failure of the old windshield `seatbelt.pt`):**
`karan-panja/seat-belt-detection-uhqwa`, `akaike/seatbelt-detection-vvyjz`,
`test-hhtok/seatbelt-detection-h4bqw` (all exterior / through-windshield gantry
views); `dataset-9xayt/seatbelt-0lhjh` (construction PPE, not driving);
`ai-zmek0/seat-belt-detection-udcfg-5jihg` (single class, no belt_off).

**Cleaning (the DMS sees one frontal driver):** drop boxes < 3% of frame area
(far-away / through-windshield occupants), then drop frames left empty or with
> 2 occupants (crowd / road scenes). Majority class (belt_on) capped to 1.5×
the minority in `merge_split.py` to counter the natural belt_on skew.

> Roboflow API key is read only from `ROBOFLOW_API_KEY`; it is never stored or
> committed.

---

## Pipeline (reproducible)

```bash
# 1. download (Roboflow key only needed for seatbelt)
python dms_data/scripts/download_coco.py --max-train 4000 --max-val 1000
ROBOFLOW_API_KEY=xxxx python dms_data/scripts/download_roboflow.py seatbelt
# 2. harmonize to canonical schemas  3. dedup + balance + split
python dms_data/scripts/harmonize.py
python dms_data/scripts/merge_split.py cabin
python dms_data/scripts/merge_split.py seatbelt --balance 1.5
# 4. train  5. evaluate  6. export
python dms_data/scripts/train.py cabin
python dms_data/scripts/train.py seatbelt
python dms_data/scripts/evaluate.py cabin
python dms_data/scripts/evaluate.py seatbelt
python dms_data/scripts/export.py cabin --format onnx
```

All third-party datasets are redistributed only as **derived YOLO labels +
references**; raw images stay under `dms_data/raw/` (git-ignored). Respect each
upstream license for any redistribution.
