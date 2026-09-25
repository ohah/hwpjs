#!/usr/bin/env python3
"""Independent read-only XML inventory for the local HWPX page geometry corpus.

This intentionally uses Python zipfile/ElementTree, not the Zig tree or parser.
It counts 2011 secPr's direct pagePr and pagePr's direct margin only. It is an
inventory of selected-looking Contents/section*.xml entries, not OPF validation.
"""

import collections
import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile


PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
ROOTS = (
    Path("legacy/rust/crates/hwp-core/tests/fixtures"),
    Path("reference/rhwp/samples"),
)


def observe(root, totals):
    if root.tag != SECTION:
        return
    totals["sections"] += 1
    pages = [page for section in root.iter(PARA + "secPr")
             for page in section if page.tag == PARA + "pagePr"]
    if not pages:
        totals["sections_without_page"] += 1
    for page in pages:
        totals["pages"] += 1
        totals["widely"] += page.get("landscape") == "WIDELY"
        totals["left_right"] += page.get("gutterType") == "LEFT_RIGHT"
        for name in ("landscape", "width", "height", "gutterType"):
            totals["missing_" + name] += name not in page.attrib
        for name in ("width", "height"):
            if name in page.attrib:
                totals[name + "_sum"] += int(page.get(name))
        margins = [child for child in page if child.tag == PARA + "margin"]
        totals["margins"] += len(margins)
        for margin in margins:
            for name in ("header", "footer", "gutter", "left", "right", "top", "bottom"):
                totals["missing_margin_" + name] += name not in margin.attrib
                if name in margin.attrib:
                    totals["margin_" + name + "_sum"] += int(margin.get(name))


def self_test():
    root = ET.fromstring(
        '<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" '
        'xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph">'
        '<p:pagePr width="99"/><p:secPr><p:pagePr width="10" height="20" '
        'landscape="WIDELY" gutterType="LEFT_RIGHT"><p:margin left="3"/>'
        '</p:pagePr><p:other><p:pagePr width="100"/></p:other></p:secPr>'
        '</s:sec>'
    )
    totals = collections.Counter()
    observe(root, totals)
    assert (totals["sections"], totals["pages"], totals["width_sum"],
            totals["margin_left_sum"], totals["missing_margin_header"]) == (1, 1, 10, 3, 1)


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("page geometry oracle self-test passed")
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-page-geometry-oracle.py [--self-test]")
    shards = [collections.Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            totals = shards[shard]
            totals["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    for member in archive.namelist():
                        if not member.startswith("Contents/section") or not member.endswith(".xml"):
                            continue
                        try:
                            observe(ET.fromstring(archive.read(member)), totals)
                        except ET.ParseError:
                            totals["unparsed_xml"] += 1
            except (zipfile.BadZipFile, OSError):
                totals["invalid_zip"] += 1
    for index, totals in enumerate(shards):
        print(index, dict(sorted(totals.items())))


if __name__ == "__main__":
    main()
