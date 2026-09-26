#!/usr/bin/env python3
"""Independent read-only secPr scalar/direct-child inventory for the local corpus."""

import collections
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
ROOTS = (
    Path("legacy/rust/crates/hwp-core/tests/fixtures"),
    Path("reference/rhwp/samples"),
)
FIELDS = (
    "id", "textDirection", "spaceColumns", "tabStop", "tabStopVal",
    "tabStopUnit", "outlineShapeIDRef", "memoShapeIDRef", "textVerticalWidthHead", "masterPageCnt",
)
NUMERIC = (
    "spaceColumns", "tabStop", "tabStopVal", "outlineShapeIDRef", "memoShapeIDRef", "masterPageCnt",
)
CHILDREN = (
    "startNum", "grid", "visibility", "lineNumberShape", "pagePr", "footNotePr",
    "endNotePr", "pageBorderFill", "masterPage", "parameterset", "presentation", "metaTag",
)


def parse_integer(raw, signed):
    value = raw.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value):
        raise ValueError("invalid decimal integer")
    number = int(value)
    minimum, maximum = (-2147483648, 2147483647) if signed else (0, 4294967295)
    if not minimum <= number <= maximum:
        raise ValueError("out-of-range integer")
    return number


def observe(root, counts):
    if root.tag != SECTION:
        return
    counts["sections"] += 1
    definitions = list(root.iter(PARA + "secPr"))
    if not definitions:
        counts["sections_without_definition"] += 1
    for definition in definitions:
        counts["definitions"] += 1
        for name in FIELDS:
            counts["missing_" + name] += name not in definition.attrib
        counts["empty_id"] += definition.get("id") == ""
        counts["direction_horizontal"] += definition.get("textDirection") == "HORIZONTAL"
        counts["unit_char"] += definition.get("tabStopUnit") == "CHAR"
        counts["vertical_width_true"] += definition.get("textVerticalWidthHead") in ("1", "true")
        counts["unknown_direction"] += definition.get("textDirection") not in (None, "HORIZONTAL", "VERTICAL", "VERTICALALL")
        counts["unknown_unit"] += definition.get("tabStopUnit") not in (None, "CHAR", "HWPUNIT")
        for name in NUMERIC:
            if name in definition.attrib:
                counts["sum_" + name] += parse_integer(definition.get(name), name in NUMERIC[:3])
        for name in definition.attrib:
            counts["other_attributes"] += name not in FIELDS
        for child in definition:
            counts["direct_children"] += 1
            if child.tag.startswith(PARA):
                local = child.tag[len(PARA):]
                if local in CHILDREN:
                    counts["child_" + local] += 1
                else:
                    counts["other_paragraph_children"] += 1
            else:
                counts["foreign_children"] += 1


def self_test():
    root = ET.fromstring(
        '<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" '
        'xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:x="urn:x">'
        '<p:secPr id="" tabStop="-2" x:tabStop="3"><p:pagePr/><p:footer/>'
        '<p:other><p:grid/></p:other><x:grid/></p:secPr></s:sec>'
    )
    counts = collections.Counter()
    observe(root, counts)
    observed = (counts["definitions"], counts["sum_tabStop"], counts["missing_tabStopVal"],
                counts["child_pagePr"], counts["child_grid"], counts["other_paragraph_children"],
                counts["foreign_children"], counts["other_attributes"])
    if observed != (1, -2, 1, 1, 0, 2, 1, 1):
        raise AssertionError(f"section definition inventory mismatch: {observed}")
    for bad in ("1_0", "4294967296", "-1"):
        try:
            parse_integer(bad, False)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid unsigned value accepted")
    for bad in ("1_0", "2147483648", "-2147483649"):
        try:
            parse_integer(bad, True)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid signed value accepted")


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("section definition oracle self-test passed")
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-section-definition-oracle.py [--self-test]")
    shards = [collections.Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            counts["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    for member in archive.namelist():
                        if not member.startswith("Contents/section") or not member.endswith(".xml"):
                            continue
                        try:
                            observe(ET.fromstring(archive.read(member)), counts)
                        except ET.ParseError:
                            counts["unparsed_xml"] += 1
            except (zipfile.BadZipFile, OSError):
                counts["invalid_zip"] += 1
    for index, counts in enumerate(shards):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
