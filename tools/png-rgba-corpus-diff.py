#!/usr/bin/env python3
"""Compare the Zig PNG RGBA stream against Pillow without applying ICC profiles."""

from collections import Counter
from pathlib import Path
import struct
import subprocess

from PIL import Image, __version__ as pillow_version
import io
import olefile


ROOT = Path(__file__).resolve().parents[1]


def main():
    local = subprocess.run(
        ["zig", "test", "src/png_rgba_survey.zig", "-O", "ReleaseFast", "--test-filter", "PNG RGBA raw local corpus stream"],
        cwd=ROOT, check=True, capture_output=True,
    )
    previews = subprocess.run(
        ["zig", "test", "src/png_rgba_survey.zig", "-O", "ReleaseFast", "--test-filter", "PNG RGBA raw HWP preview stream"],
        cwd=ROOT, check=True, capture_output=True,
    )
    local_count = compare_stream(local.stdout)
    preview_count = compare_stream(previews.stdout)
    if local_count != 57 or preview_count != 32:
        raise ValueError(f"expected 57 standalone and 32 HWP preview PNGs, got {local_count}, {preview_count}")


def compare_stream(data):
    wire = memoryview(data)
    offset = 0
    count = 0
    pixels = 0
    modes = Counter()
    while offset < len(wire):
        if len(wire) - offset < 4:
            raise ValueError("truncated path length")
        path_len = struct.unpack_from("<I", wire, offset)[0]
        offset += 4
        if len(wire) - offset < path_len + 4:
            raise ValueError("truncated path")
        path = wire[offset : offset + path_len].tobytes().decode("utf-8")
        offset += path_len
        rgba_len = struct.unpack_from("<I", wire, offset)[0]
        offset += 4
        if len(wire) - offset < rgba_len:
            raise ValueError(f"truncated RGBA for {path}")
        rgba = wire[offset : offset + rgba_len]
        offset += rgba_len
        if "::" in path:
            document, stream = path.split("::", 1)
            with olefile.OleFileIO(ROOT / document) as ole:
                encoded = ole.openstream(stream).read()
            source = io.BytesIO(encoded)
        else:
            source = ROOT / path
        with Image.open(source) as image:
            image.load()
            modes[image.mode] += 1
            expected = image.convert("RGBA").tobytes()
            if len(expected) != rgba_len or expected != rgba:
                raise ValueError(f"RGBA differs from Pillow: {path}")
            pixels += image.width * image.height
        count += 1
    print("pillow_version", pillow_version)
    print("images", count)
    print("modes", dict(modes))
    print("pixels", pixels)
    print("rgba_bytes", pixels * 4)
    return count


if __name__ == "__main__":
    main()
