#!/usr/bin/env python3
"""Read-only RGB byte comparison for one observed zero-based HWPX JPEG."""

from collections import Counter
import hashlib
import io
from pathlib import Path
import subprocess
import zipfile

from PIL import Image, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[1]
DOCUMENT = ROOT / "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx"
ENTRY = "BinData/image353.jpg"
WIDTH = 2850
HEIGHT = 3900
ZIG_SHA256 = "c3396d9614c4475afca4d549f4cdc4ebf2cbbe6684a96c0efb8b20f7fd188ed1"
PILLOW_SHA256 = "31108a53cfe483bd966e4aab074552b675797d9ec1a61e34e41422245b57777b"


def main():
    if pillow_version != "11.3.0":
        raise ValueError("pixel baseline requires Pillow 11.3.0")
    command = ["zig", "test", "src/hwpx_jpeg_pixel_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX JPEG raw observed zero-based RGB stream"]
    zig = subprocess.run(command, cwd=ROOT, capture_output=True, check=True).stdout
    with zipfile.ZipFile(DOCUMENT) as archive:
        encoded = archive.read(ENTRY)
    with Image.open(io.BytesIO(encoded)) as image:
        image.load()
        if image.mode != "RGB" or image.size != (WIDTH, HEIGHT):
            raise ValueError("tracked JPEG changed mode or dimensions")
        pillow = image.tobytes()
    if len(zig) != WIDTH * HEIGHT * 3 or len(pillow) != len(zig):
        raise ValueError("RGB extent mismatch")
    zig_digest = hashlib.sha256(zig).hexdigest()
    pillow_digest = hashlib.sha256(pillow).hexdigest()
    if (zig_digest, pillow_digest) != (ZIG_SHA256, PILLOW_SHA256):
        raise ValueError("tracked RGB digest changed; re-evaluate baseline")
    histogram = Counter(a - b for a, b in zip(zig, pillow))
    differences = len(zig) - histogram[0]
    max_absolute_difference = max(map(abs, histogram))
    if differences != 27391 or max_absolute_difference != 3:
        raise ValueError("tracked RGB pixel difference changed")
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
