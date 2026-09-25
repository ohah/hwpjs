#!/usr/bin/env python3
"""Independent ZIP/ElementTree census for secPr pageBorderFill and offset."""

from collections import Counter
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
ROOTS = (Path("legacy/rust/crates/hwp-core/tests/fixtures"), Path("reference/rhwp/samples"))
BORDER = ("type", "borderFillIDRef", "textBorder", "headerInside", "footerInside", "fillArea")
OFFSET = ("left", "right", "top", "bottom")


def unsigned(raw):
    value = raw.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value) or not 0 <= int(value) <= 4294967295:
        raise ValueError("invalid unsigned32")
    return int(value)


def boolean(raw):
    value = raw.strip(" \t\r\n")
    if value not in ("0", "1", "true", "false"):
        raise ValueError("invalid boolean")
    return value in ("1", "true")


def observe(section, counts):
    if section.tag != SECTION:
        return
    for definition in section.iter(PARA + "secPr"):
        counts["definitions"] += 1
        for border in definition:
            if border.tag != PARA + "pageBorderFill":
                continue
            counts["borders"] += 1
            counts["border_children"] += len(border)
            counts["border_other_attributes"] += sum(name not in BORDER for name in border.attrib)
            for name in BORDER:
                value = border.get(name)
                if value is None:
                    counts["missing_" + name] += 1
                    continue
                if name == "borderFillIDRef":
                    counts["border_id_sum"] += unsigned(value)
                    counts["border_id_zero"] += unsigned(value) == 0
                elif name in ("headerInside", "footerInside"):
                    counts["true_" + name] += boolean(value)
                else:
                    counts[name + "_" + value.strip(" \t\r\n")] += 1
            for offset in border:
                if offset.tag != PARA + "offset":
                    continue
                counts["offsets"] += 1
                counts["offset_children"] += len(offset)
                counts["offset_other_attributes"] += sum(name not in OFFSET for name in offset.attrib)
                for name in OFFSET:
                    value = offset.get(name)
                    if value is None:
                        counts["missing_" + name] += 1
                    else:
                        counts["sum_" + name] += unsigned(value)


def self_test():
    section = ET.fromstring('<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:x="urn:other"><p:secPr><x:pageBorderFill/><p:wrapper><p:pageBorderFill type="ODD"/></p:wrapper><p:pageBorderFill type="BOTH" borderFillIDRef="+2" headerInside="true" x:type="ODD"><x:offset/><p:offset left="7"/><p:offset/></p:pageBorderFill></p:secPr><p:pageBorderFill type="EVEN"/></s:sec>')
    counts = Counter()
    observe(section, counts)
    assert (counts["borders"], counts["offsets"], counts["border_id_sum"], counts["sum_left"], counts["border_other_attributes"], counts["missing_right"], counts["true_headerInside"]) == (1, 2, 2, 7, 1, 2, 1)
    for bad in ("1_0", "-1", "4294967296", ""):
        try:
            unsigned(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid unsigned accepted")
    try:
        boolean("TRUE")
    except ValueError:
        pass
    else:
        raise AssertionError("invalid boolean accepted")


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("section page border oracle self-test passed")
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-section-page-border-oracle.py [--self-test]")
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            counts["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    for member in archive.namelist():
                        if member.startswith("Contents/section") and member.endswith(".xml"):
                            observe(ET.fromstring(archive.read(member)), counts)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError):
                counts["unreadable"] += 1
    for index, counts in enumerate(shards):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
