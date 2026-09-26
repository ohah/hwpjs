#!/usr/bin/env python3
"""Independent read-only ZIP/XML census of section numbering and memo IDs."""

from collections import Counter
from pathlib import Path
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


HEAD = "{http://www.hancom.co.kr/hwpml/2011/head}"
PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
ROOTS = (
    Path("legacy/rust/crates/hwp-core/tests/fixtures"),
    Path("reference/rhwp/samples"),
)


def parse_id(raw):
    value = raw.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value):
        raise ValueError("invalid ID spelling")
    number = int(value)
    if number < 0 or number > 4294967295:
        raise ValueError("ID outside u32")
    return number


def classify(raw, ids, prefix, counts):
    if raw is None:
        outcome = "absent"
    elif parse_id(raw) == 0:
        outcome = "zero"
    elif ids is None:
        outcome = "absent_table"
    elif parse_id(raw) in ids:
        outcome = "resolved"
    else:
        outcome = "missing_target"
    counts[prefix + "_" + outcome] += 1


def inspect(header, sections, counts):
    ref_list = header.find(HEAD + "refList")
    if ref_list is None:
        raise ValueError("missing refList")
    tables = {}
    for group, item in (("numberings", "numbering"), ("memoProperties", "memoPr")):
        table = ref_list.find(HEAD + group)
        tables[group] = None if table is None else {parse_id(entry.attrib["id"]) for entry in table.findall(HEAD + item)}
        counts[group + "_present"] += table is not None
        counts[group + "_items"] += len(tables[group] or ())
    for section in sections:
        for definition in section.iter(PARA + "secPr"):
            counts["definitions"] += 1
            classify(definition.get("outlineShapeIDRef"), tables["numberings"], "outline", counts)
            classify(definition.get("memoShapeIDRef"), tables["memoProperties"], "memo", counts)


def self_test():
    head = ET.fromstring('<h:head xmlns:h="http://www.hancom.co.kr/hwpml/2011/head"><h:refList><h:numberings><h:numbering id="7"/></h:numberings></h:refList></h:head>')
    sec = ET.fromstring('<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:secPr/><p:secPr outlineShapeIDRef="0" memoShapeIDRef="0"/><p:secPr outlineShapeIDRef="7" memoShapeIDRef="3"/><p:secPr outlineShapeIDRef="8" memoShapeIDRef="4"/></s:sec>')
    counts = Counter()
    inspect(head, [sec], counts)
    observed = (counts["outline_absent"], counts["outline_zero"], counts["outline_resolved"], counts["outline_missing_target"], counts["memo_absent_table"])
    if observed != (1, 1, 1, 1, 2):
        raise AssertionError(f"reference classification mismatch: {observed}")
    for bad in ("1_0", "4294967296", "-1", ""):
        try:
            parse_id(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid ID accepted")


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("section definition reference oracle self-test passed")
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-section-definition-reference-oracle.py [--self-test]")
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            counts["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    header = ET.fromstring(archive.read("Contents/header.xml"))
                    sections = []
                    for member in archive.namelist():
                        if member.startswith("Contents/section") and member.endswith(".xml"):
                            sections.append(ET.fromstring(archive.read(member)))
                    inspect(header, sections, counts)
            except (KeyError, zipfile.BadZipFile, OSError, ET.ParseError):
                counts["unreadable"] += 1
    for index, counts in enumerate(shards):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
