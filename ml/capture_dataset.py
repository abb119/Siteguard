"""
Webcam capture tool for building the custom in-cabin (DMS) dataset.

You record one SCENE at a time — the scene name doubles as the label source
for the auto-labeler (ml/build_dms_dataset.py):

    python ml/capture_dataset.py --scene phone          # holding/using a phone
    python ml/capture_dataset.py --scene drinking       # cup/bottle near face
    python ml/capture_dataset.py --scene seatbelt_on    # belt fastened (visible!)
    python ml/capture_dataset.py --scene seatbelt_off   # belt NOT fastened
    python ml/capture_dataset.py --scene neutral        # nothing (negatives)

Keys:  SPACE pause/resume · Q quit
Frames land in datasets/dms_cabin/raw/<scene>/.

Tips for a good dataset: vary lighting (day/night/lamp), glasses on/off,
clothing, distance and head angles. Record several short sessions per scene
rather than one long static one. Aim for 200-500 images per scene.
"""
from __future__ import annotations

import argparse
import time
import uuid
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
SCENES = ["phone", "drinking", "seatbelt_on", "seatbelt_off", "neutral"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", required=True, choices=SCENES)
    ap.add_argument("--camera", type=int, default=0, help="webcam index")
    ap.add_argument("--interval", type=float, default=0.5, help="seconds between saved frames")
    ap.add_argument("--max", type=int, default=400, help="stop after N frames")
    args = ap.parse_args()

    out_dir = ROOT / "datasets" / "dms_cabin" / "raw" / args.scene
    out_dir.mkdir(parents=True, exist_ok=True)
    existing = len(list(out_dir.glob("*.jpg")))

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit("Could not open webcam")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print(f"Recording scene '{args.scene}' -> {out_dir}  (already has {existing})")
    print("SPACE = pause/resume · Q = quit")

    saved = 0
    paused = False
    last_save = 0.0
    while saved < args.max:
        ok, frame = cap.read()
        if not ok:
            break

        now = time.time()
        if not paused and (now - last_save) >= args.interval:
            name = f"{args.scene}_{uuid.uuid4().hex[:10]}.jpg"
            cv2.imwrite(str(out_dir / name), frame)
            saved += 1
            last_save = now

        view = frame.copy()
        status = "PAUSED" if paused else "REC"
        color = (0, 200, 255) if paused else (48, 59, 255)
        cv2.putText(view, f"[{status}] {args.scene}  saved={saved}/{args.max}",
                    (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2, cv2.LINE_AA)
        cv2.imshow("SiteGuard dataset capture", view)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord(" "):
            paused = not paused

    cap.release()
    cv2.destroyAllWindows()
    print(f"Done: saved {saved} frames (total now {existing + saved}) in {out_dir}")


if __name__ == "__main__":
    main()
