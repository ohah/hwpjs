#!/usr/bin/env python3
"""Independent ZIP/ElementTree census of direct secPr presentation values."""

from collections import Counter
import io
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
CORE = "{http://www.hancom.co.kr/hwpml/2011/core}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
ROOTS = (Path("legacy/rust/crates/hwp-core/tests/fixtures"), Path("reference/rhwp/samples"))
FIELDS = ("effect", "soundIDRef", "invertText", "autoshow", "showtime", "applyto")
EFFECTS = frozenset("none overLeft overRight overUp overDown rectOut rectIn blindLeft blindRight blindUp blindDown cuttonHorzOut cuttonHorzIn cuttonVertOut cuttonVertIn moveLeft moveRight moveUp moveDown random".split())


def unsigned32(raw):
    value = raw.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value):
        raise ValueError("bad unsigned spelling")
    number = int(value)
    if number < 0 or number > 4294967295:
        raise ValueError("unsigned out of bounds")
    return number


def boolean(raw):
    value = raw.strip(" \t\r\n")
    if value not in ("0", "1", "true", "false"):
        raise ValueError("bad boolean")
    return value in ("1", "true")


def observe(section, counts):
    if section.tag != SECTION:
        return
    for definition in section.iter(PARA + "secPr"):
        counts["definitions"] += 1
        for item in definition:
            if item.tag != PARA + "presentation":
                continue
            counts["presentations"] += 1
            counts["other_attributes"] += sum(name not in FIELDS for name in item.attrib)
            for field in FIELDS:
                raw = item.get(field)
                if raw is None:
                    counts["missing_" + field] += 1
                    continue
                value = raw.strip(" \t\r\n")
                if field == "effect":
                    counts["unknown_enums"] += value not in EFFECTS
                    counts["effect_" + value] += 1
                elif field == "soundIDRef":
                    counts["sound_empty"] += raw == ""
                    counts["sound_nonempty"] += raw != ""
                elif field in ("invertText", "autoshow"):
                    counts[field + "_true"] += boolean(raw)
                elif field == "showtime":
                    counts["showtime_sum"] += unsigned32(raw)
                else:
                    counts["unknown_enums"] += value not in ("WholeDoc", "NewSection")
                    counts["applyto_" + value] += 1
            for child in item:
                counts["direct_children"] += 1
                if child.tag == CORE + "fillBrush":
                    counts["fill_brushes"] += 1
                    counts["other_attributes"] += len(child.attrib)
                    counts["brush_direct_children"] += len(child)
                    counts["brush_gradation"] += sum(grandchild.tag == CORE + "gradation" for grandchild in child)
                else:
                    counts["other_children"] += 1


def inspect_archive(archive):
    counts = Counter()
    for member in archive.namelist():
        if member.startswith("Contents/section") and member.endswith(".xml"):
            observe(ET.fromstring(archive.read(member)), counts)
    return counts


def self_test():
    source = '<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:c="http://www.hancom.co.kr/hwpml/2011/core" xmlns:x="urn:other"><p:secPr><x:presentation/><p:wrapper><p:presentation/></p:wrapper><p:presentation effect="future" soundIDRef="" invertText="true" autoshow="0" showtime="+2" applyto="NewSection"><c:fillBrush><c:gradation/></c:fillBrush></p:presentation></p:secPr></s:sec>'
    counts = Counter()
    observe(ET.fromstring(source), counts)
    observed = (counts["presentations"], counts["fill_brushes"], counts["brush_gradation"], counts["unknown_enums"], counts["sound_empty"], counts["invertText_true"], counts["showtime_sum"])
    if observed != (1, 1, 1, 1, 1, 1, 2):
        raise AssertionError(f"presentation observation mismatch: {observed}")
    for bad in ("1_0", "4294967296", "-1", ""):
        try:
            unsigned32(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("bad unsigned accepted")
    try:
        boolean("TRUE")
    except ValueError:
        pass
    else:
        raise AssertionError("bad boolean accepted")
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w") as archive:
        archive.writestr("Contents/section0.xml", source)
        archive.writestr("Contents/section1.xml", "<broken")
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
        print("section presentation oracle self-test passed")
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-section-presentation-oracle.py [--self-test]")
    for index, counts in enumerate(collect()):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
