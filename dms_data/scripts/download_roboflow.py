"""
Download Roboflow Universe datasets into dms_data/raw/roboflow/<slug>/ (YOLO format).

SECURITY: the API key is read ONLY from the environment variable ROBOFLOW_API_KEY.
Never hardcode or commit it.  Run as:
    ROBOFLOW_API_KEY=xxxx python dms_data/scripts/download_roboflow.py            # all
    ROBOFLOW_API_KEY=xxxx python dms_data/scripts/download_roboflow.py seatbelt   # one group

Each source is (workspace, project, version|None, local_slug).  version=None -> latest.
The original class names are NOT changed here; harmonize.py remaps them later using
the per-slug MAPS table (keyed by the same local_slug).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # dms_data/
OUT = ROOT / "raw" / "roboflow"

# --- Seatbelt sources (Model B) -------------------------------------------------
# Verified live: karan-panja exposes person-seatbelt / person-noseatbelt / seatbelt.
SEATBELT_SOURCES = [
    ("karan-panja", "seat-belt-detection-uhqwa", 1, "karan_seatbelt"),
    ("akaike", "seatbelt-detection-vvyjz", None, "akaike_seatbelt"),
    ("ai-zmek0", "seat-belt-detection-udcfg-5jihg", None, "aizmek_seatbelt"),
]

# --- Cabin context sources (Model A, optional supplement to COCO) ---------------
# Only sources that box the OBJECT (phone/bottle/cup), not the gesture.
CABIN_SOURCES = [
    # ("workspace", "project", None, "slug"),  # add if a clean object-boxed set is found
]

GROUPS = {"seatbelt": SEATBELT_SOURCES, "cabin": CABIN_SOURCES}


def download(sources, fmt: str = "yolov8") -> None:
    from roboflow import Roboflow

    key = os.getenv("ROBOFLOW_API_KEY")
    if not key:
        sys.exit("ERROR: ROBOFLOW_API_KEY not set in environment.")
    rf = Roboflow(api_key=key)
    OUT.mkdir(parents=True, exist_ok=True)

    for ws, proj, ver, slug in sources:
        loc = OUT / slug
        if (loc / "data.yaml").exists():
            print(f"[skip] {slug} already present at {loc}")
            continue
        try:
            project = rf.workspace(ws).project(proj)
            if ver is None:
                ver = max(int(v.version) for v in project.versions())
            print(f"[get ] {ws}/{proj} v{ver} -> {loc}")
            project.version(int(ver)).download(fmt, location=str(loc))
            classes = getattr(project, "classes", None)
            print(f"       classes: {classes}")
        except Exception as e:  # noqa: BLE001 - keep going on a bad source
            print(f"[ERR ] {ws}/{proj}: {type(e).__name__}: {str(e)[:140]}")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which == "all":
        download(SEATBELT_SOURCES + CABIN_SOURCES)
    elif which in GROUPS:
        download(GROUPS[which])
    else:
        sys.exit(f"unknown group '{which}', choose from: all, {', '.join(GROUPS)}")
