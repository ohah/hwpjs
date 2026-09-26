#!/usr/bin/env python3
"""Independent ZIP/ElementTree oracle for selected HWPX number controls."""

import hashlib
import pathlib
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = (
    ROOT / "legacy/rust/crates/hwp-core/tests/fixtures",
    ROOT / "reference/rhwp/samples",
)
OPF = "{http://www.idpf.org/2007/opf/}"
PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
KINDS = {PARA + "autoNum": 0, PARA + "newNum": 1, PARA + "pageNum": 2}
FORMAT = PARA + "autoNumFormat"
AUTO_ATTRS = ("num", "numType")
PAGE_ATTRS = ("pos", "formatType", "sideChar")
FORMAT_ATTRS = ("type", "userChar", "prefixChar", "suffixChar", "supscript")
AUTO_TYPES = set("PAGE FOOTNOTE ENDNOTE PICTURE TABLE EQUATION TOTAL_PAGE".split())
PAGE_POS = set("NONE TOP_LEFT TOP_CENTER TOP_RIGHT BOTTOM_LEFT BOTTOM_CENTER BOTTOM_RIGHT OUTSIDE_TOP OUTSIDE_BOTTOM INSIDE_TOP INSIDE_BOTTOM".split())
NUMBER_TYPES = set("DIGIT CIRCLED_DIGIT ROMAN_CAPITAL ROMAN_SMALL LATIN_CAPITAL LATIN_SMALL CIRCLED_LATIN_CAPITAL CIRCLED_LATIN_SMALL HANGUL_SYLLABLE CIRCLED_HANGUL_SYLLABLE HANGUL_JAMO CIRCLED_HANGUL_JAMO HANGUL_PHONETIC IDEOGRAPH CIRCLED_IDEOGRAPH DECAGON_CIRCLE DECAGON_CIRCLE_HANJA SYMBOL USER_CHAR SYMBOL2 IMAGE 2DIGIT".split())


def require(condition, evidence):
    if not condition:
        raise AssertionError(evidence)


def number(digest, count):
    digest.update(count.to_bytes(8, "little"))


def value(digest, data):
    number(digest, len(data))
    digest.update(data)


def optional(digest, data):
    if data is None:
        digest.update(b"\x00")
    else:
        digest.update(b"\x01")
        value(digest, data.encode("utf-8"))


def tri(digest, data, choices):
    number(digest, 0 if data is None else 2 if data.strip(" \t\r\n") in choices else 1)


def split_name(tag):
    if tag.startswith("{"):
        return tag[1:].split("}", 1)
    return "", tag


def inspect_sections(sections):
    rows = []
    for ordinal, xml in enumerate(sections):
        section = ET.fromstring(xml)
        require(section.tag == SECTION, section.tag)
        parents = {child: parent for parent in section.iter() for child in parent}
        indices = {item: index for index, item in enumerate(section.iter())}
        for item in section.iter():
            if item.tag not in KINDS:
                continue
            parent = parents.get(item)
            if parent is not None:
                rows.append((ordinal, indices[parent], indices[item], split_name(parent.tag), item, indices))
    formats_total = sum(sum(child.tag == FORMAT for child in item) for *_, item, _ in rows)
    digest = hashlib.sha256()
    number(digest, len(sections))
    number(digest, len(rows))
    number(digest, formats_total)
    counts = [0, 0, 0, formats_total, 0]
    for ordinal, parent_index, index, parent_name, item, indices in rows:
        kind = KINDS[item.tag]
        counts[kind] += 1
        formats = [child for child in item if child.tag == FORMAT]
        if kind == 0 and not formats:
            counts[4] += 1
        number(digest, ordinal)
        number(digest, parent_index)
        number(digest, index)
        number(digest, kind)
        value(digest, parent_name[0].encode())
        value(digest, parent_name[1].encode())
        attrs = AUTO_ATTRS if kind < 2 else PAGE_ATTRS
        for attr in attrs:
            optional(digest, item.get(attr))
        if kind < 2:
            tri(digest, item.get("numType"), AUTO_TYPES)
        else:
            tri(digest, item.get("pos"), PAGE_POS)
            tri(digest, item.get("formatType"), NUMBER_TYPES)
        number(digest, len(item.attrib.keys() - set(attrs)))
        number(digest, len(item))
        number(digest, len(item) - len(formats))
        number(digest, len(formats))
        for child in formats:
            number(digest, indices[child])
            for attr in FORMAT_ATTRS:
                optional(digest, child.get(attr))
            tri(digest, child.get("type"), NUMBER_TYPES)
            number(digest, len(child.attrib.keys() - set(FORMAT_ATTRS)))
            number(digest, len(child))
    return digest.hexdigest(), *counts


def oracle(path):
    with zipfile.ZipFile(path) as archive:
        opf = ET.fromstring(archive.read("Contents/content.hpf"))
        manifest = {item.get("id"): item for item in opf.findall(OPF + "manifest/" + OPF + "item")}
        sections = []
        for ref in opf.findall(OPF + "spine/" + OPF + "itemref"):
            item = manifest[ref.get("idref")]
            if item.get("media-type") != "application/xml":
                continue
            xml = archive.read(item.get("href"))
            if ET.fromstring(xml).tag == SECTION:
                sections.append(xml)
        return inspect_sections(sections)


def expected_all():
    accepted, rejected, encrypted = {}, set(), set()
    for root_index, root in enumerate(SOURCES):
        for path in root.rglob("*.hwpx"):
            require(path.stat().st_size <= 25_000_000, path)
            key = root_index, hashlib.sha256(path.relative_to(root).as_posix().encode()).hexdigest()
            try:
                with zipfile.ZipFile(path) as archive:
                    if "META-INF/manifest.xml" in archive.namelist() and b"encryption-data" in archive.read("META-INF/manifest.xml"):
                        encrypted.add(key)
                        continue
                accepted[key] = oracle(path)
            except zipfile.BadZipFile:
                rejected.add(key)
    return accepted, rejected, encrypted


def product():
    result = subprocess.run(
        ["zig", "test", "src/hwpx_number_controls_survey.zig", "-O", "ReleaseFast",
         "--test-filter", "HWPX number controls corpus per-file independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    accepted, rejected, encrypted = {}, set(), set()
    totals = None
    for line in result.stderr.splitlines():
        if "NUMBER_CORPUS_FILE " in line:
            _, root, path_hash, digest, *counts = line[line.index("NUMBER_CORPUS_FILE "):].split()
            require(len(counts) == 5, line)
            key = int(root), path_hash
            require(key not in accepted, key)
            accepted[key] = digest, *(int(count) for count in counts)
        elif "NUMBER_CORPUS_REJECTED " in line:
            _, root, path_hash = line[line.index("NUMBER_CORPUS_REJECTED "):].split()
            rejected.add((int(root), path_hash))
        elif "NUMBER_CORPUS_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("NUMBER_CORPUS_ENCRYPTED "):].split()
            encrypted.add((int(root), path_hash))
        elif line.startswith("NUMBER_CORPUS_TOTAL "):
            totals = tuple(int(v) for v in line.split()[1:])
    return accepted, rejected, encrypted, totals


def self_test():
    prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>"
    suffix = "</p:run></p:p></s:sec>"
    source = "<p:ctrl><p:autoNum num='0' numType='PAGE'><p:autoNumFormat type='DIGIT' userChar='' prefixChar='' suffixChar=')' supscript='0'/></p:autoNum><p:newNum num='1' numType='ENDNOTE'/><p:pageNum pos='NONE' formatType='DIGIT' sideChar='-'/></p:ctrl>"
    baseline = inspect_sections([(prefix + source + suffix).encode()])
    require(baseline[1:] == (1, 1, 1, 1, 0), baseline)
    for changed in (
        source.replace("num='0'", "num='2'"),
        source.replace("numType='PAGE'", "numType='TABLE'"),
        source.replace("type='DIGIT'", "type='ROMAN_SMALL'", 1),
        source.replace("suffixChar=')'", "suffixChar=''"),
        source.replace("supscript='0'", "supscript='1'"),
        source.replace("pos='NONE'", "pos='BOTTOM_RIGHT'"),
        source.replace("sideChar='-'", "sideChar=''"),
        source.replace("<p:autoNumFormat", "<x:autoNumFormat"),
        source.replace("</p:autoNum>", "<p:future/></p:autoNum>"),
        source.replace("<p:autoNum ", "<x:autoNum ").replace("</p:autoNum>", "</x:autoNum>"),
    ):
        require(baseline[0] != inspect_sections([(prefix + changed + suffix).encode()])[0], "mutation escaped digest")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("number controls oracle self-test passed")
    elif not sys.argv[1:]:
        expected, rejected, encrypted = expected_all()
        actual, actual_rejected, actual_encrypted, totals = product()
        require(set(actual) == set(expected), ("accepted set", set(actual) ^ set(expected)))
        require(actual_rejected == rejected, ("rejected set", actual_rejected ^ rejected))
        require(actual_encrypted == encrypted, ("encrypted set", actual_encrypted ^ encrypted))
        require(totals == (len(expected), len(rejected), len(encrypted)), totals)
        for key, row in expected.items():
            require(actual[key] == row, ("mismatch", key, actual[key], row))
        print(f"number controls corpus matched files={len(expected)} rejected={len(rejected)} encrypted={len(encrypted)} auto={sum(row[1] for row in expected.values())} new={sum(row[2] for row in expected.values())} page={sum(row[3] for row in expected.values())} format={sum(row[4] for row in expected.values())} auto_missing_format={sum(row[5] for row in expected.values())}")
    else:
        raise SystemExit("usage: hwpx-number-controls-diff.py [--self-test]")
