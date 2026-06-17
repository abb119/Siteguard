"""
Download a COCO 2017 subset (cell phone / bottle / cup) into
    dms_data/raw/coco/images/{train,val}/   and   .../labels/{train,val}/
already in YOLO format and remapped to the canonical cabin schema
    0:phone  1:bottle  2:cup

No FiftyOne / MongoDB dependency: pulls the official annotation zip once and
then only the matching images (threaded + resumable).  Rarer classes
(phone, cup) are prioritised so they survive the per-split cap.

    python dms_data/scripts/download_coco.py --max-train 4000 --max-val 1000
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import io
import json
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent          # dms_data/
RAW = ROOT / "raw" / "coco"
ANN_ZIP_URL = "http://images.cocodataset.org/annotations/annotations_trainval2017.zip"
IMG_URL = "http://images.cocodataset.org/{split}2017/{fid:012d}.jpg"

# COCO category name -> canonical cabin class id
WANT = {"cell phone": 0, "bottle": 1, "cup": 2}
CANON_NAMES = {0: "phone", 1: "bottle", 2: "cup"}
# Prioritise phone & cup when capping. (Rebalancing toward bottle was tried and
# reverted: it lifted bottle slightly but hurt phone/cup and the global mAP.)
RARE = {0, 2}


def ensure_annotations() -> None:
    ann_dir = RAW / "annotations"
    need = [ann_dir / "instances_train2017.json", ann_dir / "instances_val2017.json"]
    if all(p.exists() for p in need):
        return
    ann_dir.mkdir(parents=True, exist_ok=True)
    print("downloading COCO annotations (~240 MB, one time)...")
    with urllib.request.urlopen(ANN_ZIP_URL) as r:  # noqa: S310 - official COCO host
        blob = r.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for member in z.namelist():
            if member.endswith(("instances_train2017.json", "instances_val2017.json")):
                target = ann_dir / Path(member).name
                target.write_bytes(z.read(member))
                print("  extracted", target.name)


def _download_image(task) -> bool:
    fid, split, fname = task
    out = RAW / "images" / split / fname
    if out.exists() and out.stat().st_size > 0:
        return True
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(IMG_URL.format(split=split, fid=fid), timeout=30) as r:  # noqa: S310
            out.write_bytes(r.read())
        return True
    except Exception:  # noqa: BLE001
        return False


def process_split(split: str, max_samples: int, workers: int) -> None:
    ann = json.loads((RAW / "annotations" / f"instances_{split}2017.json").read_text())
    catid2canon = {c["id"]: WANT[c["name"]] for c in ann["categories"] if c["name"] in WANT}
    images = {im["id"]: im for im in ann["images"]}

    per_img: dict[int, list] = {}
    for a in ann["annotations"]:
        if a["category_id"] in catid2canon and not a.get("iscrowd", 0):
            per_img.setdefault(a["image_id"], []).append(a)

    def priority(iid: int) -> int:
        cls = {catid2canon[a["category_id"]] for a in per_img[iid]}
        return 0 if cls & RARE else 1  # rare-class images first

    img_ids = sorted(per_img.keys(), key=lambda i: (priority(i), i))
    if max_samples:
        img_ids = img_ids[:max_samples]

    (RAW / "labels" / split).mkdir(parents=True, exist_ok=True)
    tasks = [(iid, split, images[iid]["file_name"]) for iid in img_ids]
    ok = 0
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for got in tqdm(ex.map(_download_image, tasks), total=len(tasks), desc=f"{split} imgs"):
            ok += int(got)

    counts: Counter = Counter()
    written = 0
    for iid in img_ids:
        im = images[iid]
        img_path = RAW / "images" / split / im["file_name"]
        if not img_path.exists():
            continue
        w, h = im["width"], im["height"]
        lines = []
        for a in per_img[iid]:
            canon = catid2canon[a["category_id"]]
            x, y, bw, bh = a["bbox"]
            if bw <= 0 or bh <= 0:
                continue
            cx, cy, nw, nh = (x + bw / 2) / w, (y + bh / 2) / h, bw / w, bh / h
            lines.append(f"{canon} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")
            counts[CANON_NAMES[canon]] += 1
        (RAW / "labels" / split / f"{img_path.stem}.txt").write_text("\n".join(lines))
        written += 1
    print(f"{split}: {len(img_ids)} selected, {ok} downloaded, {written} labelled | instances {dict(counts)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-train", type=int, default=4000)
    ap.add_argument("--max-val", type=int, default=1000)
    ap.add_argument("--workers", type=int, default=16)
    args = ap.parse_args()

    ensure_annotations()
    process_split("train", args.max_train, args.workers)
    process_split("val", args.max_val, args.workers)
    print("done. COCO subset at", RAW)


if __name__ == "__main__":
    main()
