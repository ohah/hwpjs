#!/usr/bin/env python3
"""Independent ZIP/ElementTree census for secPr pageBorderFill and offset."""

from collections import Counter
import io
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
HEAD = "{http://www.hancom.co.kr/hwpml/2011/head}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
ROOTS = (Path("legacy/rust/crates/hwp-core/tests/fixtures"), Path("reference/rhwp/samples"))
BORDER = ("type", "borderFillIDRef", "textBorder", "headerInside", "footerInside", "fillArea")
OFFSET = ("left", "right", "top", "bottom")


def expect_equal(actual, expected):
    if actual != expected:
        raise AssertionError(f"page border oracle mismatch: {actual!r} != {expected!r}")


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


def border_ids(header):
    ref_list = header.find(HEAD + "refList")
    if ref_list is None:
        return None
    group = ref_list.find(HEAD + "borderFills")
    return None if group is None else {unsigned(entry.attrib["id"]) for entry in group.findall(HEAD + "borderFill")}


def observe(section, counts, ids):
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
                    if name == "borderFillIDRef":
                        counts["ref_absent"] += 1
                    continue
                if name == "borderFillIDRef":
                    ident = unsigned(value)
                    counts["border_id_sum"] += ident
                    counts["border_id_zero"] += ident == 0
                    if ids is None:
                        counts["ref_absent_table"] += 1
                    elif ident in ids:
                        counts["ref_resolved"] += 1
                    else:
                        counts["ref_missing_target"] += 1
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


def inspect_archive(archive):
    counts = Counter()
    ids = border_ids(ET.fromstring(archive.read("Contents/header.xml")))
    for member in archive.namelist():
        if member.startswith("Contents/section") and member.endswith(".xml"):
            observe(ET.fromstring(archive.read(member)), counts, ids)
    return counts


def self_test():
    section = ET.fromstring('<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:x="urn:other"><p:secPr><x:pageBorderFill/><p:wrapper><p:pageBorderFill type="ODD"/></p:wrapper><p:pageBorderFill type="BOTH" borderFillIDRef="+2" headerInside="true" x:type="ODD"><x:offset/><p:offset left="7"/><p:offset/></p:pageBorderFill></p:secPr><p:pageBorderFill type="EVEN"/></s:sec>')
    counts = Counter()
    observe(section, counts, {2})
    expect_equal((counts["borders"], counts["offsets"], counts["border_id_sum"], counts["sum_left"], counts["border_other_attributes"], counts["missing_right"], counts["true_headerInside"]), (1, 2, 2, 7, 1, 2, 1))
    expect_equal(counts["ref_resolved"], 1)
    header = ET.fromstring('<h:head xmlns:h="http://www.hancom.co.kr/hwpml/2011/head"><h:refList><h:borderFills><h:borderFill id="0"/><h:borderFill id="7"/></h:borderFills></h:refList></h:head>')
    expect_equal(border_ids(header), {0, 7})
    expect_equal(border_ids(ET.fromstring('<h:head xmlns:h="http://www.hancom.co.kr/hwpml/2011/head"><h:refList/></h:head>')), None)
    zero_section = ET.fromstring('<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:secPr><p:pageBorderFill borderFillIDRef="0"/><p:pageBorderFill borderFillIDRef="8"/><p:pageBorderFill/></p:secPr></s:sec>')
    zero_counts = Counter()
    observe(zero_section, zero_counts, border_ids(header))
    expect_equal((zero_counts["ref_resolved"], zero_counts["ref_missing_target"], zero_counts["ref_absent"], zero_counts["border_id_zero"]), (1, 1, 1, 1))
    absent_counts = Counter()
    observe(zero_section, absent_counts, None)
    expect_equal((absent_counts["ref_absent_table"], absent_counts["ref_absent"]), (2, 1))
    expect_equal(border_ids(ET.fromstring('<h:head xmlns:h="http://www.hancom.co.kr/hwpml/2011/head"/>')), None)
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w") as archive:
        archive.writestr("Contents/header.xml", ET.tostring(header))
        archive.writestr("Contents/section0.xml", ET.tostring(zero_section))
        archive.writestr("Contents/section1.xml", "<broken")
    with zipfile.ZipFile(memory) as archive:
        try:
            inspect_archive(archive)
        except ET.ParseError:
            pass
        else:
            raise AssertionError("partial malformed file accepted")
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
                    file_counts = inspect_archive(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                counts["unreadable"] += 1
            else:
                counts.update(file_counts)
    for index, counts in enumerate(shards):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
