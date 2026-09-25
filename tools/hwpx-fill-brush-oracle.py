#!/usr/bin/env python3
"""Independent ZIP/ElementTree census for selected HWPX fillBrush trees."""

from collections import Counter
import io
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


CORE = "{http://www.hancom.co.kr/hwpml/2011/core}"
ROOTS = (Path("legacy/rust/crates/hwp-core/tests/fixtures"), Path("reference/rhwp/samples"))
FIELDS = {
    "winBrush": ("faceColor", "hatchColor", "hatchStyle", "alpha"),
    "gradation": ("type", "angle", "centerX", "centerY", "step", "colorNum", "stepCenter", "alpha"),
    "imgBrush": ("mode",),
    "color": ("value",),
    "img": ("binaryItemIDRef", "bright", "contrast", "effect", "alpha"),
}
ENUMS = {
    ("winBrush", "hatchStyle"): set("HORIZONTAL VERTICAL BACK_SLASH SLASH CROSS CROSS_DIAGONAL".split()),
    ("gradation", "type"): set("LINEAR RADIAL CONICAL SQUARE".split()),
    ("imgBrush", "mode"): set("TILE TILE_HORZ_TOP TILE_HORZ_BOTTOM TILE_VERT_LEFT TILE_VERT_RIGHT TOTAL CENTER CENTER_TOP CENTER_BOTTOM LEFT_CENTER LEFT_TOP LEFT_BOTTOM RIGHT_CENTER RIGHT_TOP RIGHT_BOTTOM ZOOM".split()),
    ("img", "effect"): set("REAL_PIC GRAY_SCALE BLACK_WHITE".split()),
}
SIGNED = {("gradation", name) for name in ("angle", "centerX", "centerY", "step", "stepCenter")} | {("img", "bright"), ("img", "contrast")}
FLOAT = {("winBrush", "alpha"), ("gradation", "alpha"), ("img", "alpha")}
COLOR = {("winBrush", "faceColor"), ("winBrush", "hatchColor"), ("color", "value")}


def integer(raw, signed=False):
    value = raw.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value):
        raise ValueError("bad integer")
    number = int(value)
    lower, upper = (-2147483648, 2147483647) if signed else (0, 4294967295)
    if not lower <= number <= upper:
        raise ValueError("integer outside model bounds")
    return number


def float_lexical(raw):
    value = raw.strip(" \t\r\n")
    if value in ("INF", "-INF", "NaN"):
        return
    if not re.fullmatch(r"[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?)|(?:\.[0-9]+))(?:[eE][+-]?[0-9]+)?", value):
        raise ValueError("bad XML float")


def six_hex(raw):
    return re.fullmatch(r"#[0-9A-Fa-f]{6}", raw) is not None


def fields(node, kind, counts):
    counts["other_attributes"] += sum(name not in FIELDS[kind] for name in node.attrib)
    for field in FIELDS[kind]:
        raw = node.get(field)
        if raw is None:
            counts["missing_" + kind + "_" + field] += 1
            continue
        key = kind + "_" + field
        if (kind, field) in ENUMS:
            counts["unknown_enums"] += raw.strip(" \t\r\n") not in ENUMS[kind, field]
            counts[key + "_" + raw.strip(" \t\r\n")] += 1
        elif (kind, field) in SIGNED:
            counts[key + "_sum"] += integer(raw, signed=True)
        elif kind == "gradation" and field == "colorNum":
            counts[key + "_sum"] += integer(raw)
        elif (kind, field) in FLOAT:
            float_lexical(raw)
            counts[key + "_nonzero"] += raw.strip(" \t\r\n") not in ("0", "0.0", "+0", "-0")
        elif (kind, field) in COLOR:
            counts["non_six_hex_colors"] += not six_hex(raw)
            counts[key + "_none"] += raw == "none"
            counts[key + "_eight_hex"] += re.fullmatch(r"#[0-9A-Fa-f]{8}", raw) is not None
        elif kind == "img" and field == "binaryItemIDRef":
            counts["image_ref_nonempty"] += raw != ""


def observe(root, counts, part):
    for parent in root.iter():
        for brush in parent:
            if brush.tag != CORE + "fillBrush":
                continue
            counts["brushes"] += 1
            counts[part + "_brushes"] += 1
            counts["brush_parent_" + parent.tag.rsplit("}", 1)[-1]] += 1
            counts["other_attributes"] += len(brush.attrib)
            variants = 0
            for variant in brush:
                counts["direct_children"] += 1
                if not variant.tag.startswith(CORE) or variant.tag[len(CORE):] not in ("winBrush", "gradation", "imgBrush"):
                    counts["other_brush_children"] += 1
                    continue
                kind = variant.tag[len(CORE):]
                variants += 1
                counts[kind] += 1
                fields(variant, kind, counts)
                colors = 0
                for leaf in variant:
                    counts["direct_children"] += 1
                    expected = "color" if kind == "gradation" else "img" if kind == "imgBrush" else None
                    if expected is None or leaf.tag != CORE + expected:
                        counts["other_variant_children"] += 1
                        continue
                    counts[expected] += 1
                    colors += expected == "color"
                    fields(leaf, expected, counts)
                    counts["direct_children"] += len(leaf)
                    counts["leaf_children"] += len(leaf)
                if kind == "gradation" and "colorNum" in variant.attrib:
                    counts["color_count_mismatch"] += integer(variant.attrib["colorNum"]) != colors
            counts["multiple_variants"] += variants > 1


def inspect_archive(archive):
    counts = Counter()
    for member in archive.namelist():
        if member == "Contents/header.xml" or (member.startswith("Contents/section") and member.endswith(".xml")):
            observe(ET.fromstring(archive.read(member)), counts, "header" if member == "Contents/header.xml" else "section")
    return counts


def self_test():
    source = '<h:head xmlns:h="http://www.hancom.co.kr/hwpml/2011/head" xmlns:c="http://www.hancom.co.kr/hwpml/2011/core" xmlns:x="urn:other"><x:fillBrush/><h:borderFill><c:fillBrush><x:gradation/><c:winBrush faceColor="none" alpha=".5"/><c:gradation type="LINEAR" colorNum="2" alpha="1e-2"><c:color value="#123456"/></c:gradation><c:imgBrush mode="ZOOM"><c:img binaryItemIDRef="image1" bright="-1" effect="REAL_PIC"/></c:imgBrush></c:fillBrush></h:borderFill></h:head>'
    counts = Counter()
    observe(ET.fromstring(source), counts, "header")
    assert (counts["brushes"], counts["winBrush"], counts["gradation"], counts["imgBrush"], counts["color"], counts["img"], counts["non_six_hex_colors"], counts["color_count_mismatch"], counts["multiple_variants"]) == (1, 1, 1, 1, 1, 1, 1, 1, 1)
    for bad in ("1_0", "2147483648", "-2147483649", ""):
        try:
            integer(bad, signed=True)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid signed accepted")
    for bad in ("1_0", "1e", "+INF", ""):
        try:
            float_lexical(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid float accepted")
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w") as archive:
        archive.writestr("Contents/header.xml", source)
        archive.writestr("Contents/section0.xml", "<broken")
    with zipfile.ZipFile(memory) as archive:
        try:
            inspect_archive(archive)
        except ET.ParseError:
            pass
        else:
            raise AssertionError("partial malformed ZIP accepted")


def collect():
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            counts["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    file_counts = inspect_archive(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                counts["unreadable"] += 1
            else:
                counts.update(file_counts)
    return shards


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("fill brush oracle self-test passed")
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-fill-brush-oracle.py [--self-test]")
    for index, counts in enumerate(collect()):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
