#!/usr/bin/env python3
"""Read-only PNG RGBA comparison for one real HWP BinData and one HWPX ZIP item."""

import hashlib
import io
from pathlib import Path
import subprocess
import zipfile

import olefile
from PIL import Image, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[1]
CASES = [
    ("HWP BinData", "PNG RGBA raw HWP BinData stream", "d14568f24bd855ad2028cd23d830104df6497a174654e4509e54daec34f12303", 153664),
    ("HWPX BinData", "PNG RGBA raw HWPX BinData stream", "f33fbbcce1b234a2a3fd5b59dff4496310d5a9cefbf3720840070c7256ade3fe", 256),
]


def main():
    hwp = ROOT / "reference/rhwp/samples/task1749/saved_bounds_cumulative_vpos.hwp"
    with olefile.OleFileIO(hwp) as ole:
        encoded_hwp = ole.openstream("BinData/BIN0001.PNG").read()
    import zlib
    encoded_hwp = zlib.decompress(encoded_hwp, -15)
    hwpx = ROOT / "reference/rhwp/samples/issue5595_rotated_picture_topbottom.hwpx"
    with zipfile.ZipFile(hwpx) as archive:
        encoded_hwpx = archive.read("BinData/image1.png")
    for (label, test, expected_hash, expected_bytes), encoded in zip(CASES, (encoded_hwp, encoded_hwpx)):
        result = subprocess.run(
            ["zig", "test", "src/png_rgba_product_survey.zig", "-O", "ReleaseFast", "--test-filter", test],
            cwd=ROOT, capture_output=True, check=True,
        )
        with Image.open(io.BytesIO(encoded)) as image:
            image.load()
            reference = image.convert("RGBA").tobytes()
        digest = hashlib.sha256(reference).hexdigest()
        if digest != expected_hash or len(reference) != expected_bytes or result.stdout != reference:
            raise ValueError(f"RGBA mismatch: {label}")
        print(label, "bytes", len(reference), "sha256", digest)
    print("pillow_version", pillow_version)


if __name__ == "__main__":
    main()
