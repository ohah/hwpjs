#!/usr/bin/env python3
"""Independent ZIP/ElementTree oracle for selected HWPX column definitions."""

import hashlib
import pathlib
import re
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
COL = PARA + "colPr"
LINE = PARA + "colLine"
SIZE = PARA + "colSz"
COL_ATTRS = ("id", "type", "layout", "colCount", "sameSz", "sameGap")
LINE_ATTRS = ("type", "width", "color")
SIZE_ATTRS = ("width", "gap")
COL_TYPES = {"NEWSPAPER", "BALANCED_NEWSPAPER", "PARALLEL"}
LAYOUTS = {"LEFT", "RIGHT", "MIRROR"}
LINE_TYPES = {"NONE", "SOLID", "DOT", "DASH", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE",
              "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM", "WAVE", "DOUBLEWAVE",
              "THICK3D", "THICKREV3D", "3D", "REV3D"}
LINE_WIDTHS = {"0.1 mm", "0.12 mm", "0.15 mm", "0.2 mm", "0.25 mm", "0.3 mm", "0.4 mm",
               "0.5 mm", "0.6 mm", "0.7 mm", "1.0 mm", "1.5 mm", "2.0 mm", "3.0 mm", "4.0 mm", "5.0 mm"}


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


def tri_state(digest, raw, predicate):
    number(digest, 0 if raw is None else 2 if predicate(raw) else 1)


def split_name(tag):
    if tag.startswith("{"):
        return tag[1:].split("}", 1)
    return "", tag


def known(raw, choices):
    return raw.strip(" \t\r\n") in choices


def width_known(raw):
    normalized = re.sub(r"[ \t\r\n]+", " ", raw).strip(" ")
    return normalized in LINE_WIDTHS


def canonical_color(raw):
    return re.fullmatch(r"#[0-9A-Fa-f]{6}", raw) is not None


def inspect_sections(sections):
    rows = []
    for ordinal, xml in enumerate(sections):
        section = ET.fromstring(xml)
        require(section.tag == SECTION, section.tag)
        parents = {child: parent for parent in section.iter() for child in parent}
        indices = {item: index for index, item in enumerate(section.iter())}
        for column in section.iter(COL):
            parent = parents.get(column)
            if parent is None:
                continue
            rows.append((ordinal, indices[parent], indices[column], split_name(parent.tag), column, indices))
    children_total = sum(sum(child.tag in (LINE, SIZE) for child in item) for *_, item, _ in rows)
    digest = hashlib.sha256()
    number(digest, len(sections))
    number(digest, len(rows))
    number(digest, children_total)
    unknown_types = unequal = mismatches = uniform_sizes = 0
    for ordinal, parent_index, index, parent_name, item, indices in rows:
        children = [child for child in item if child.tag in (LINE, SIZE)]
        lines = sum(child.tag == LINE for child in children)
        sizes = len(children) - lines
        same_raw = item.get("sameSz")
        same = None if same_raw is None else same_raw.strip(" \t\r\n") in ("true", "1")
        mismatch = same is False and item.get("colCount") is not None and sizes != int(item.get("colCount").strip())
        uniform = same is True and sizes != 0
        unknown_types += item.get("type") is not None and not known(item.get("type"), COL_TYPES)
        unequal += same is False
        mismatches += mismatch
        uniform_sizes += uniform
        number(digest, ordinal)
        number(digest, parent_index)
        number(digest, index)
        value(digest, parent_name[0].encode())
        value(digest, parent_name[1].encode())
        for attr in COL_ATTRS:
            optional(digest, item.get(attr))
        tri_state(digest, item.get("type"), lambda raw: known(raw, COL_TYPES))
        tri_state(digest, item.get("layout"), lambda raw: known(raw, LAYOUTS))
        number(digest, len(item.attrib.keys() - set(COL_ATTRS)))
        number(digest, len(item))
        number(digest, len(item) - len(children))
        number(digest, lines)
        number(digest, sizes)
        number(digest, mismatch)
        number(digest, uniform)
        number(digest, len(children))
        for child in children:
            number(digest, indices[child])
            number(digest, 0 if child.tag == LINE else 1)
            attrs = LINE_ATTRS if child.tag == LINE else SIZE_ATTRS
            for attr in attrs:
                optional(digest, child.get(attr))
            if child.tag == LINE:
                tri_state(digest, child.get("type"), lambda raw: known(raw, LINE_TYPES))
                tri_state(digest, child.get("width"), width_known)
                tri_state(digest, child.get("color"), canonical_color)
            number(digest, len(child.attrib.keys() - set(attrs)))
            number(digest, len(child))
    return digest.hexdigest(), len(rows), children_total, unknown_types, unequal, mismatches, uniform_sizes


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
        ["zig", "test", "src/hwpx_column_definitions_survey.zig", "-O", "ReleaseFast",
         "--test-filter", "HWPX column definitions corpus per-file independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    accepted, rejected, encrypted = {}, set(), set()
    totals = None
    for line in result.stderr.splitlines():
        if "COLUMN_CORPUS_FILE " in line:
            _, root, path_hash, hash_value, *counts = line[line.index("COLUMN_CORPUS_FILE "):].split()
            require(len(counts) == 6, line)
            key = int(root), path_hash
            require(key not in accepted, key)
            accepted[key] = hash_value, *(int(count) for count in counts)
        elif "COLUMN_CORPUS_REJECTED " in line:
            _, root, path_hash = line[line.index("COLUMN_CORPUS_REJECTED "):].split()
            rejected.add((int(root), path_hash))
        elif "COLUMN_CORPUS_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("COLUMN_CORPUS_ENCRYPTED "):].split()
            encrypted.add((int(root), path_hash))
        elif line.startswith("COLUMN_CORPUS_TOTAL "):
            totals = tuple(int(v) for v in line.split()[1:])
    return accepted, rejected, encrypted, totals


def self_test():
    prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>"
    suffix = "</p:run></p:p></s:sec>"
    source = "<p:ctrl><p:colPr type='NORMAL' layout='LEFT' colCount='2' sameSz='0' sameGap='0'><p:colLine type='SOLID' width='0.12 mm' color='#000000'/><p:colSz width='100' gap='0'/><p:colSz width='200' gap='0'/></p:colPr></p:ctrl>"
    baseline = inspect_sections([(prefix + source + suffix).encode()])
    require(baseline[1:] == (1, 3, 1, 1, 0, 0), baseline)
    for changed in (
        source.replace("type='NORMAL'", "type='NEWSPAPER'"),
        source.replace("layout='LEFT'", "layout='RIGHT'"),
        source.replace("colCount='2'", "colCount='3'"),
        source.replace("sameSz='0'", "sameSz='1'"),
        source.replace("width='100'", "width='101'"),
        source.replace("gap='0'", "gap='1'", 1),
        source.replace("color='#000000'", "color='bad'"),
        source.replace("<p:colSz width='200'", "<x:colSz width='200'"),
        source.replace("</p:colPr>", "<p:future/></p:colPr>"),
        source.replace("<p:colPr", "<x:colPr").replace("</p:colPr>", "</x:colPr>"),
        source.replace("<p:colLine", "<p:colLine future='x'"),
    ):
        require(baseline[0] != inspect_sections([(prefix + changed + suffix).encode()])[0], "mutation escaped digest")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("column definitions oracle self-test passed")
    elif not sys.argv[1:]:
        expected, rejected, encrypted = expected_all()
        actual, actual_rejected, actual_encrypted, totals = product()
        require(set(actual) == set(expected), ("accepted set", set(actual) ^ set(expected)))
        require(actual_rejected == rejected, ("rejected set", actual_rejected ^ rejected))
        require(actual_encrypted == encrypted, ("encrypted set", actual_encrypted ^ encrypted))
        require(totals == (len(expected), len(rejected), len(encrypted)), totals)
        for key, row in expected.items():
            require(actual[key] == row, ("mismatch", key, actual[key], row))
        print(f"column definitions corpus matched files={len(expected)} rejected={len(rejected)} encrypted={len(encrypted)} columns={sum(row[1] for row in expected.values())} children={sum(row[2] for row in expected.values())} unknown_types={sum(row[3] for row in expected.values())} unequal={sum(row[4] for row in expected.values())} mismatches={sum(row[5] for row in expected.values())} uniform_sizes={sum(row[6] for row in expected.values())}")
    else:
        raise SystemExit("usage: hwpx-column-definitions-diff.py [--self-test]")
