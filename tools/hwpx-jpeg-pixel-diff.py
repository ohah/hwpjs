#!/usr/bin/env python3
"""Read-only Zig/Pillow RGB comparison for one tracked HWPX grayscale JPEG."""

from collections import Counter
import hashlib
import io
import math
from pathlib import Path
import re
import struct
import subprocess
import zipfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx"
ENTRY = "BinData/image1.jpg"
WIDTH = 1240
HEIGHT = 84
EXPECTED_ZIG_SHA256 = "bb76fe42843734b3201859908bbe72fea06210ed008238f93bbb66c5e76de001"
EXPECTED_PILLOW_SHA256 = "77edee45a0a7fbd1918d135a0ffb40a5842208c59a6ee6343d05575be5ff776e"


def compare(zig_rgb, pillow_rgb, width):
    if len(zig_rgb) != len(pillow_rgb) or len(zig_rgb) % (width * 3):
        raise ValueError("RGB extent mismatch")
    differences = Counter(z - p for z, p in zip(zig_rgb, pillow_rgb))
    first = []
    mismatched_pixels = 0
    for pixel in range(len(zig_rgb) // 3):
        offset = pixel * 3
        zig = tuple(zig_rgb[offset:offset + 3])
        pillow = tuple(pillow_rgb[offset:offset + 3])
        if zig != pillow:
            mismatched_pixels += 1
            if len(first) < 12:
                first.append((pixel % width, pixel // width, zig, pillow))
    return {
        "different_channels": len(zig_rgb) - differences[0],
        "different_pixels": mismatched_pixels,
        "max_absolute_difference": max((abs(delta) for delta in differences), default=0),
        "sum_absolute_difference": sum(abs(delta) * count for delta, count in differences.items()),
        "difference_histogram": dict(sorted(differences.items())),
        "first_differences": first,
    }


def self_test():
    result = compare(bytes((1, 1, 1, 2, 2, 2)), bytes((1, 1, 1, 3, 3, 3)), 2)
    assert result["different_channels"] == 3
    assert result["different_pixels"] == 1
    assert result["difference_histogram"] == {-1: 3, 0: 3}
    try:
        compare(b"bad", b"longer", 1)
    except ValueError:
        pass
    else:
        raise AssertionError("extent mismatch accepted")
    dc = [0] * 64
    dc[0] = 8
    assert abs(direct_idct(dc, 5, 1) - 1) < 1e-12


def direct_idct(coefficients, x, y):
    if len(coefficients) != 64 or not 0 <= x < 8 or not 0 <= y < 8:
        raise ValueError("invalid DCT input")
    terms = []
    for index, value in enumerate(coefficients):
        u = index % 8
        v = index // 8
        cu = 1 / math.sqrt(2) if u == 0 else 1
        cv = 1 / math.sqrt(2) if v == 0 else 1
        terms.append(value * cu * cv * math.cos((2 * x + 1) * u * math.pi / 16) * math.cos((2 * y + 1) * v * math.pi / 16) / 4)
    return math.fsum(terms)


def first_mismatch_idct():
    command = ["zig", "test", "src/hwpx_jpeg_pixel_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX JPEG grayscale first mismatch IDCT evidence"]
    process = subprocess.run(command, cwd=ROOT, capture_output=True, check=True)
    match = re.search(rb"IDCT centered=([+-]?[0-9.]+) sample=([0-9]+) sparse=([^\r\n]+)", process.stderr)
    if match is None:
        raise ValueError("missing Zig coefficient evidence")
    coefficients = [0] * 64
    for entry in match.group(3).split():
        index, value = entry.split(b":")
        coefficients[int(index)] = int(value)
    zig_centered = float(match.group(1))
    direct_centered = direct_idct(coefficients, 5, 1)
    if abs(zig_centered - direct_centered) > 1e-9 or int(match.group(2)) != 255:
        raise ValueError("Zig IDCT disagrees with independent direct formula")
    return zig_centered, direct_centered


def all_mismatch_idct(zig_rgb, pillow_rgb):
    command = ["zig", "test", "src/hwpx_jpeg_pixel_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX JPEG dequantized grayscale block stream"]
    process = subprocess.run(command, cwd=ROOT, capture_output=True, check=True)
    record = struct.Struct("<II64q")
    if len(process.stdout) % record.size:
        raise ValueError("truncated Zig coefficient stream")
    blocks = {}
    for values in record.iter_unpack(process.stdout):
        key = values[:2]
        if not 0 <= key[0] < (WIDTH + 7) // 8 or not 0 <= key[1] < (HEIGHT + 7) // 8:
            raise ValueError("JPEG block coordinate outside image")
        if key in blocks:
            raise ValueError("duplicate JPEG block coordinate")
        blocks[key] = values[2:]
    if len(blocks) != ((WIDTH + 7) // 8) * ((HEIGHT + 7) // 8):
        raise ValueError("missing JPEG blocks")
    mismatches = 0
    zig_matches_formula = 0
    pillow_matches_formula = 0
    farthest_from_tie = 0.0
    for pixel in range(WIDTH * HEIGHT):
        offset = pixel * 3
        if zig_rgb[offset] == pillow_rgb[offset]:
            continue
        mismatches += 1
        x, y = pixel % WIDTH, pixel // WIDTH
        centered = direct_idct(blocks[(x // 8, y // 8)], x % 8, y % 8)
        rounded = math.floor(centered) + (centered - math.floor(centered) >= 0.5) + 128
        expected = max(0, min(255, rounded))
        zig_matches_formula += zig_rgb[offset] == expected
        pillow_matches_formula += pillow_rgb[offset] == expected
        farthest_from_tie = max(farthest_from_tie, abs(centered - math.floor(centered) - 0.5))
    return {
        "mismatched_pixels_checked": mismatches,
        "zig_matches_independent_dct": zig_matches_formula,
        "pillow_matches_independent_dct": pillow_matches_formula,
        "max_distance_from_half_tie": farthest_from_tie,
    }


def main():
    self_test()
    command = ["zig", "test", "src/hwpx_jpeg_pixel_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX JPEG raw grayscale pixel stream"]
    process = subprocess.run(command, cwd=ROOT, capture_output=True, check=True)
    zig_rgb = process.stdout
    with zipfile.ZipFile(SAMPLE) as archive:
        encoded = archive.read(ENTRY)
    with Image.open(io.BytesIO(encoded)) as image:
        image.load()
        if image.size != (WIDTH, HEIGHT) or image.mode != "L":
            raise ValueError("tracked JPEG changed shape or mode")
        pillow_rgb = image.convert("RGB").tobytes()
    if len(zig_rgb) != WIDTH * HEIGHT * 3:
        raise ValueError("Zig stream extent mismatch")
    if any(zig_rgb[at] != zig_rgb[at + 1] or zig_rgb[at] != zig_rgb[at + 2] for at in range(0, len(zig_rgb), 3)):
        raise ValueError("Zig grayscale channels disagree")
    if any(pillow_rgb[at] != pillow_rgb[at + 1] or pillow_rgb[at] != pillow_rgb[at + 2] for at in range(0, len(pillow_rgb), 3)):
        raise ValueError("Pillow grayscale channels disagree")
    zig_sha256 = hashlib.sha256(zig_rgb).hexdigest()
    pillow_sha256 = hashlib.sha256(pillow_rgb).hexdigest()
    if zig_sha256 != EXPECTED_ZIG_SHA256 or pillow_sha256 != EXPECTED_PILLOW_SHA256:
        raise ValueError("tracked JPEG pixel digest changed; re-evaluate documented evidence")
    print("zig_sha256", zig_sha256)
    print("pillow_sha256", pillow_sha256)
    differences = compare(zig_rgb, pillow_rgb, WIDTH)
    if differences["different_pixels"] != 152 or differences["max_absolute_difference"] != 1:
        raise ValueError("tracked JPEG pixel difference changed")
    for name, value in differences.items():
        print(name, value)
    zig_centered, direct_centered = first_mismatch_idct()
    print("first_mismatch_zig_centered", zig_centered)
    print("first_mismatch_independent_idct_centered", direct_centered)
    print("first_mismatch_pillow_channel", pillow_rgb[(1 * WIDTH + 965) * 3])
    idct_check = all_mismatch_idct(zig_rgb, pillow_rgb)
    if idct_check["mismatched_pixels_checked"] != 152 or idct_check["zig_matches_independent_dct"] != 152 or idct_check["pillow_matches_independent_dct"] != 0:
        raise ValueError("tracked JPEG IDCT relationship changed")
    for name, value in idct_check.items():
        print(name, value)


if __name__ == "__main__":
    main()
