#!/usr/bin/env python3
"""Independent atomic ZIP/ElementTree census of secPr foot/end note shapes."""

from collections import Counter
import io
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
ROOTS = (Path("legacy/rust/crates/hwp-core/tests/fixtures"), Path("reference/rhwp/samples"))
FIELDS = {
    "autoNumFormat": ("type", "userChar", "prefixChar", "suffixChar", "supscript"),
    "noteLine": ("length", "type", "width", "color"),
    "noteSpacing": ("betweenNotes", "belowLine", "aboveLine"),
    "numbering": ("type", "newNum"),
    "placement": ("place", "beneathText"),
}
NUMBER_TYPES = frozenset("DIGIT CIRCLED_DIGIT ROMAN_CAPITAL ROMAN_SMALL LATIN_CAPITAL LATIN_SMALL CIRCLED_LATIN_CAPITAL CIRCLED_LATIN_SMALL HANGUL_SYLLABLE CIRCLED_HANGUL_SYLLABLE HANGUL_JAMO CIRCLED_HANGUL_JAMO HANGUL_PHONETIC IDEOGRAPH CIRCLED_IDEOGRAPH DECAGON_CIRCLE DECAGON_CIRCLE_HANJA SYMBOL USER_CHAR SYMBOL2 IMAGE 2DIGIT".split())
LINE_TYPES = frozenset("NONE SOLID DOT DASH DASH_DOT DASH_DOT_DOT LONG_DASH CIRCLE DOUBLE_SLIM SLIM_THICK THICK_SLIM SLIM_THICK_SLIM WAVE DOUBLEWAVE THICK3D THICKREV3D 3D REV3D".split())
WIDTHS = frozenset("0.1|0.12|0.15|0.2|0.25|0.3|0.4|0.5|0.6|0.7|1.0|1.5|2.0|3.0|4.0|5.0".split("|"))


def integer(raw, signed=False, positive=False):
    value = raw.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value):
        raise ValueError("bad integer spelling")
    number = int(value)
    minimum, maximum = (-2147483648, 2147483647) if signed else (1 if positive else 0, 4294967295)
    if not minimum <= number <= maximum:
        raise ValueError("integer out of model bounds")
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
        for note in definition:
            if note.tag not in (PARA + "footNotePr", PARA + "endNotePr"):
                continue
            kind = "foot" if note.tag.endswith("footNotePr") else "end"
            counts["notes_" + kind] += 1
            counts["other_attributes"] += len(note.attrib)
            for child in note:
                counts["direct_children"] += 1
                if not child.tag.startswith(PARA) or child.tag[len(PARA):] not in FIELDS:
                    counts["unknown_children"] += 1
                    continue
                child_kind = child.tag[len(PARA):]
                counts[kind + "_" + child_kind] += 1
                counts["grandchildren"] += len(child)
                counts["other_attributes"] += sum(name not in FIELDS[child_kind] for name in child.attrib)
                for name in FIELDS[child_kind]:
                    raw = child.get(name)
                    if raw is None:
                        counts["missing_" + kind + "_" + child_kind + "_" + name] += 1
                        continue
                    value = raw.strip(" \t\r\n")
                    if child_kind == "autoNumFormat":
                        if name == "type":
                            counts["unknown_enums"] += value not in NUMBER_TYPES
                            counts[kind + "_user_type"] += value == "USER_CHAR"
                        elif name == "supscript":
                            counts[kind + "_supscript_true"] += boolean(raw)
                        else:
                            counts[kind + "_" + name + "_nonempty"] += len(raw) > 0
                    elif child_kind == "noteLine":
                        if name == "length":
                            counts[kind + "_line_length_sum"] += integer(raw, signed=True)
                        elif name == "type":
                            counts["unknown_enums"] += value not in LINE_TYPES
                            counts[kind + "_line_none"] += value == "NONE"
                            counts[kind + "_line_thick_slim"] += value == "THICK_SLIM"
                        elif name == "width":
                            canonical = re.sub(r"[ \t\r\n]+", " ", raw).strip(" ")
                            counts["unknown_enums"] += not (canonical.endswith(" mm") and canonical[:-3] in WIDTHS)
                            counts[kind + "_width4"] += canonical == "4 mm"
                        else:
                            counts["noncanonical_colors"] += re.fullmatch(r"#[0-9A-Fa-f]{6}", raw) is None
                    elif child_kind == "noteSpacing":
                        counts[kind + "_" + name + "_sum"] += integer(raw)
                    elif child_kind == "numbering":
                        if name == "newNum":
                            counts[kind + "_new_num_sum"] += integer(raw, positive=True)
                        else:
                            allowed = {"CONTINUOUS", "ON_SECTION", "ON_PAGE"} if kind == "foot" else {"CONTINUOUS", "ON_SECTION"}
                            counts["unknown_enums"] += value not in allowed
                            counts[kind + "_on_page"] += value == "ON_PAGE"
                    else:
                        if name == "beneathText":
                            counts[kind + "_beneath_true"] += boolean(raw)
                        else:
                            allowed = {"EACH_COLUMN", "MERGED_COLUMN", "RIGHT_MOST_COLUMN"} if kind == "foot" else {"END_OF_DOCUMENT", "END_OF_SECTION"}
                            counts["unknown_enums"] += value not in allowed
                            counts[kind + "_each_column"] += value == "EACH_COLUMN"


def inspect_archive(archive):
    counts = Counter()
    for member in archive.namelist():
        if member.startswith("Contents/section") and member.endswith(".xml"):
            observe(ET.fromstring(archive.read(member)), counts)
    return counts


def self_test():
    source = '<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:x="urn:other"><p:secPr><x:footNotePr/><p:wrapper><p:footNotePr/></p:wrapper><p:footNotePr><p:autoNumFormat type="USER_CHAR" userChar="*"/><p:noteLine length="-4" width="4 mm" color="#A10FCA0"/><p:numbering newNum="+2" type="ON_PAGE"/></p:footNotePr><p:endNotePr><p:placement place="EACH_COLUMN"/></p:endNotePr></p:secPr></s:sec>'
    counts = Counter()
    observe(ET.fromstring(source), counts)
    observed = (counts["notes_foot"], counts["notes_end"], counts["unknown_enums"], counts["noncanonical_colors"], counts["foot_line_length_sum"], counts["foot_new_num_sum"], counts["missing_end_placement_beneathText"])
    if observed != (1, 1, 2, 1, -4, 2, 1):
        raise AssertionError(f"note shape observation mismatch: {observed}")
    for bad in ("1_0", "4294967296", "-1", "", "0"):
        try:
            integer(bad, positive=True)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid positive integer accepted")
    try:
        boolean("TRUE")
    except ValueError:
        pass
    else:
        raise AssertionError("invalid boolean accepted")
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
            raise AssertionError("partial malformed file accepted")


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
        print("section note shapes oracle self-test passed")
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-section-note-shapes-oracle.py [--self-test]")
    for index, counts in enumerate(collect()):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
