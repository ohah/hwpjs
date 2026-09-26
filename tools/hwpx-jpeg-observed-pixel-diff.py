#!/usr/bin/env python3
"""Read-only RGB byte comparisons for observed HWPX JPEG colour paths."""

import argparse
from collections import Counter
import hashlib
import io
from pathlib import Path
import subprocess
import zipfile

from PIL import Image, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[1]
DOCUMENT = ROOT / "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx"
CASES = {
    "zero-based": {
        "entry": "BinData/image353.jpg",
        "size": (2850, 3900),
        "test": "HWPX JPEG raw observed zero-based RGB stream",
        "zig_sha256": "c3396d9614c4475afca4d549f4cdc4ebf2cbbe6684a96c0efb8b20f7fd188ed1",
        "pillow_sha256": "31108a53cfe483bd966e4aab074552b675797d9ec1a61e34e41422245b57777b",
        "different_channels": 27391,
    },
    "exif-adobe": {
        "entry": "BinData/image177.jpg",
        "size": (2011, 133),
        "test": "HWPX JPEG raw Exif Adobe RGB stream",
        "zig_sha256": "04c262f6954de3a0cb4dea9768e3afcf31194b883fbd2b6c67531911b1153fc5",
        "pillow_sha256": "1abcbedf0573e2181d181fe7d29aaf733b0cf682f8d6025ebdf0b1ff2bdf8fdd",
        "different_channels": 650,
    },
    "exif-ycck": {
        "document": ROOT / "reference/rhwp/samples/issue6269/156739836_public_sector_jobs_stats.hwpx",
        "entry": "BinData/image1.jpg",
        "size": (1211, 355),
        "mode": "CMYK",
        "test": "HWPX JPEG raw Exif Adobe YCCK RGB stream",
        "zig_sha256": "69ef7f808d6c286c51a5b1201d901ff2b7403d90f0c725b545c47c111befe8d8",
        "pillow_sha256": "a627653a1a092eafc5f3de44019d9cdfd5153c851b54119521fed0c33d621131",
        "different_channels": 3206,
    },
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=CASES, default="zero-based")
    args = parser.parse_args()
    case = CASES[args.case]
    if pillow_version != "11.3.0":
        raise ValueError("pixel baseline requires Pillow 11.3.0")
    command = ["zig", "test", "src/hwpx_jpeg_pixel_survey.zig", "-O", "ReleaseFast", "--test-filter", case["test"]]
    zig = subprocess.run(command, cwd=ROOT, capture_output=True, check=True).stdout
    with zipfile.ZipFile(case.get("document", DOCUMENT)) as archive:
        encoded = archive.read(case["entry"])
    with Image.open(io.BytesIO(encoded)) as image:
        image.load()
        if image.mode != case.get("mode", "RGB") or image.size != case["size"]:
            raise ValueError("tracked JPEG changed mode or dimensions")
        pillow = image.convert("RGB").tobytes()
    if len(zig) != case["size"][0] * case["size"][1] * 3 or len(pillow) != len(zig):
        raise ValueError("RGB extent mismatch")
    zig_digest = hashlib.sha256(zig).hexdigest()
    pillow_digest = hashlib.sha256(pillow).hexdigest()
    if (zig_digest, pillow_digest) != (case["zig_sha256"], case["pillow_sha256"]):
        raise ValueError("tracked RGB digest changed; re-evaluate baseline")
    histogram = Counter(a - b for a, b in zip(zig, pillow))
    differences = len(zig) - histogram[0]
    max_absolute_difference = max(map(abs, histogram))
    if differences != case["different_channels"] or max_absolute_difference != 3:
        raise ValueError("tracked RGB pixel difference changed")
    print("case", args.case)
    print("pillow_version", pillow_version)
    print("zig_sha256", zig_digest)
    print("pillow_sha256", pillow_digest)
    print("rgb_bytes", len(zig))
    print("different_channels", differences)
    print("max_absolute_difference", max_absolute_difference)
    print("difference_histogram", dict(sorted(histogram.items())))
    print("zig_channel_sums", [sum(zig[channel::3]) for channel in range(3)])
    print("pillow_channel_sums", [sum(pillow[channel::3]) for channel in range(3)])


if __name__ == "__main__":
    main()
