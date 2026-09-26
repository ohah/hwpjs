#!/usr/bin/env python3
"""Independent ZIP/XML census of direct secPr setting fields."""

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
ROOTS = (
    Path("legacy/rust/crates/hwp-core/tests/fixtures"),
    Path("reference/rhwp/samples"),
)
FIELDS = {
    "startNum": ("pageStartsOn", "page", "pic", "tbl", "equation"),
    "grid": ("lineGrid", "charGrid", "wonggojiFormat", "strikeContinue"),
    "visibility": ("hideFirstHeader", "hideFirstFooter", "hideFirstMasterPage", "border", "fill", "hideFirstPageNum", "hideFirstEmptyLine", "showLineNumber"),
    "lineNumberShape": ("restartType", "countBy", "distance", "startNumber"),
}
NUMERIC = frozenset(("page", "pic", "tbl", "equation", "lineGrid", "charGrid", "restartType", "countBy", "distance", "startNumber"))
BOOLEAN = frozenset(("wonggojiFormat", "hideFirstHeader", "hideFirstFooter", "hideFirstMasterPage", "hideFirstPageNum", "hideFirstEmptyLine", "showLineNumber"))


def unsigned(raw):
    value = raw.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value):
        raise ValueError("invalid unsigned spelling")
    result = int(value)
    if not 0 <= result <= 4294967295:
        raise ValueError("unsigned32 overflow")
    return result


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
        for child in definition:
            if not child.tag.startswith(PARA):
                continue
            kind = child.tag[len(PARA):]
            if kind not in FIELDS:
                continue
            counts["item_" + kind] += 1
            counts["direct_children"] += len(child)
            for name in FIELDS[kind]:
                value = child.get(name)
                if value is None:
                    counts["missing_" + kind + "_" + name] += 1
                    continue
                counts["present_" + kind + "_" + name] += 1
                if name in NUMERIC:
                    counts["sum_" + name] += unsigned(value)
                elif name in BOOLEAN:
                    counts["true_" + name] += boolean(value)
                elif name == "strikeContinue":
                    counts["strike_raw_" + value] += 1
                elif name == "pageStartsOn":
                    counts["page_start_" + value.strip(" \t\r\n")] += 1
                elif name in ("border", "fill"):
                    counts[name + "_" + value.strip(" \t\r\n")] += 1
            counts["other_attributes"] += sum(name not in FIELDS[kind] for name in child.attrib)


def inspect_archive(archive):
    counts = Counter()
    for member in archive.namelist():
        if member.startswith("Contents/section") and member.endswith(".xml"):
            observe(ET.fromstring(archive.read(member)), counts)
    return counts


def self_test():
    section = ET.fromstring('<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:x="urn:wrong"><p:secPr><x:grid lineGrid="99"/><p:wrapper><p:grid lineGrid="88"/></p:wrapper><p:startNum pageStartsOn="ODD" page="+2"/><p:grid lineGrid="3" strikeContinue="true" x:charGrid="99"/><p:visibility border="SHOW_FIRST" hideFirstHeader="1"/></p:secPr><p:secPr><p:grid lineGrid="4"/></p:secPr></s:sec>')
    counts = Counter()
    observe(section, counts)
    observed = (counts["definitions"], counts["item_grid"], counts["sum_lineGrid"], counts["sum_page"], counts["strike_raw_true"], counts["other_attributes"], counts["missing_grid_charGrid"])
    if observed != (2, 2, 7, 2, 1, 1, 2):
        raise AssertionError(f"direct setting inventory mismatch: {observed}")
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
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w") as archive:
        archive.writestr("Contents/section0.xml", ET.tostring(section))
        archive.writestr("Contents/section1.xml", "<broken")
    with zipfile.ZipFile(memory) as archive:
        try:
            inspect_archive(archive)
        except ET.ParseError:
            pass
        else:
            raise AssertionError("partial malformed file accepted")


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("section direct settings oracle self-test passed")
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-section-direct-settings-oracle.py [--self-test]")
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            counts["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    file_counts = inspect_archive(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError):
                counts["unreadable"] += 1
            else:
                counts.update(file_counts)
    for index, counts in enumerate(shards):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
