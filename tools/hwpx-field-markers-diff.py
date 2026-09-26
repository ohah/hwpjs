#!/usr/bin/env python3
"""Independent ZIP/ElementTree oracle for selected HWPX field marker links."""

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
BEGIN = PARA + "fieldBegin"
END = PARA + "fieldEnd"
BEGIN_ATTRS = ("id", "type", "name", "editable", "dirty", "zorder", "fieldid")
END_ATTRS = ("beginIDRef", "fieldid")
CHILDREN = (PARA + "parameters", PARA + "subList", PARA + "metaTag")
ISSUES = {"none": 0, "missing_reference": 1, "missing_begin": 2,
          "ambiguous_begin": 3, "forward_reference": 4, "duplicate_end": 5}


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
        start = len(rows)
        for item in section.iter():
            if item.tag not in (BEGIN, END):
                continue
            parent = parents.get(item)
            if parent is None:
                continue
            row = {"ordinal": ordinal, "parent": indices[parent], "index": indices[item],
                   "kind": 0 if item.tag == BEGIN else 1, "parent_name": split_name(parent.tag),
                   "item": item, "match": None, "duplicate": False, "issue": "none",
                   "fieldid_mismatch": False, "non_lifo": False}
            rows.append(row)
        grouped = {}
        for global_index in range(start, len(rows)):
            row = rows[global_index]
            if row["kind"] == 0 and row["item"].get("id") is not None:
                grouped.setdefault(int(row["item"].get("id").strip()), []).append(global_index)
        for indices_by_id in grouped.values():
            if len(indices_by_id) > 1:
                for idx in indices_by_id:
                    rows[idx]["duplicate"] = True
        for global_index in range(start, len(rows)):
            row = rows[global_index]
            if row["kind"] != 1:
                continue
            ref = row["item"].get("beginIDRef")
            if ref is None:
                row["issue"] = "missing_reference"
                continue
            choices = grouped.get(int(ref.strip()), [])
            if not choices:
                row["issue"] = "missing_begin"
            elif len(choices) != 1:
                row["issue"] = "ambiguous_begin"
            elif choices[0] >= global_index:
                row["issue"] = "forward_reference"
            elif rows[choices[0]]["match"] is not None:
                row["issue"] = "duplicate_end"
            else:
                begin = rows[choices[0]]
                begin["match"] = global_index
                row["match"] = choices[0]
                left, right = begin["item"].get("fieldid"), row["item"].get("fieldid")
                row["fieldid_mismatch"] = left is not None and right is not None and int(left.strip()) != int(right.strip())
        open_indices = []
        for global_index in range(start, len(rows)):
            row = rows[global_index]
            if row["kind"] == 0:
                open_indices.append(global_index)
            elif row["match"] is not None:
                if not open_indices or open_indices[-1] != row["match"]:
                    row["non_lifo"] = True
                open_indices = [idx for idx in open_indices if idx != row["match"]]

    digest = hashlib.sha256()
    number(digest, len(sections))
    number(digest, len(rows))
    begins = ends = unmatched = unresolved = other_attrs = 0
    for row in rows:
        item = row["item"]
        kind = row["kind"]
        begins += kind == 0
        ends += kind == 1
        unmatched += kind == 0 and row["match"] is None
        unresolved += kind == 1 and row["issue"] != "none"
        number(digest, row["ordinal"])
        number(digest, row["parent"])
        number(digest, row["index"])
        number(digest, kind)
        value(digest, row["parent_name"][0].encode())
        value(digest, row["parent_name"][1].encode())
        attrs = BEGIN_ATTRS if kind == 0 else END_ATTRS
        for attr in attrs:
            optional(digest, item.get(attr))
        extras = len(item.attrib.keys() - set(attrs))
        other_attrs += extras
        number(digest, extras)
        number(digest, len(item))
        for child_tag in CHILDREN:
            number(digest, sum(child.tag == child_tag for child in item) if kind == 0 else 0)
        number(digest, len(item) - sum(child.tag in CHILDREN for child in item) if kind == 0 else len(item))
        number(digest, row["match"] if row["match"] is not None else (1 << 64) - 1)
        number(digest, row["duplicate"])
        number(digest, ISSUES[row["issue"]])
        number(digest, row["fieldid_mismatch"])
        number(digest, row["non_lifo"])
    return digest.hexdigest(), begins, ends, unmatched, unresolved, other_attrs


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
        ["zig", "test", "src/hwpx_field_markers_survey.zig", "-O", "ReleaseFast",
         "--test-filter", "HWPX field markers corpus per-file independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    accepted, rejected, encrypted = {}, set(), set()
    totals = None
    for line in result.stderr.splitlines():
        if "FIELD_CORPUS_FILE " in line:
            _, root, path_hash, hash_value, *counts = line[line.index("FIELD_CORPUS_FILE "):].split()
            require(len(counts) == 5, line)
            key = int(root), path_hash
            require(key not in accepted, key)
            accepted[key] = hash_value, *(int(count) for count in counts)
        elif "FIELD_CORPUS_REJECTED " in line:
            _, root, path_hash = line[line.index("FIELD_CORPUS_REJECTED "):].split()
            rejected.add((int(root), path_hash))
        elif "FIELD_CORPUS_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("FIELD_CORPUS_ENCRYPTED "):].split()
            encrypted.add((int(root), path_hash))
        elif line.startswith("FIELD_CORPUS_TOTAL "):
            totals = tuple(int(v) for v in line.split()[1:])
    return accepted, rejected, encrypted, totals


def self_test():
    prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>"
    suffix = "</p:run></p:p></s:sec>"
    source = "<p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' name='A&amp;B' fieldid='8'><p:parameters/></p:fieldBegin></p:ctrl><p:ctrl><p:fieldEnd beginIDRef='1' fieldid='8'/></p:ctrl>"
    baseline = inspect_sections([(prefix + source + suffix).encode()])
    require(baseline[1:] == (1, 1, 0, 0, 0), baseline)
    for changed in (
        source.replace("name='A&amp;B'", "name='B&amp;B'"),
        source.replace("type='CLICK_HERE'", "type='FUTURE'"),
        source.replace("<p:parameters/>", "<x:parameters/>"),
        source.replace("<p:parameters/>", "<p:metaTag/>"),
        source.replace("beginIDRef='1'", "beginIDRef='9'"),
        source.replace("fieldid='8'/>", "fieldid='7'/>"),
        source.replace("<p:fieldEnd", "<x:fieldEnd").replace("</p:fieldEnd>", "</x:fieldEnd>"),
        source.replace("<p:fieldBegin", "<x:fieldBegin").replace("</p:fieldBegin>", "</x:fieldBegin>"),
        source.replace("id='1'", "id='2'"),
        source.replace("<p:fieldEnd", "<p:fieldEnd future='yes'"),
    ):
        require(baseline[0] != inspect_sections([(prefix + changed + suffix).encode()])[0], "mutation escaped digest")
    future = "<p:fieldEnd beginIDRef='1'/><p:fieldBegin id='1'/>"
    require(inspect_sections([(prefix + future + suffix).encode()])[4] == 1, "forward reference missed")
    require(inspect_sections([(prefix + "<p:fieldBegin id='1'/>" + suffix).encode()])[3] == 1, "unclosed begin missed")
    duplicate = "<p:fieldBegin id='1'/><p:fieldBegin id='1'/><p:fieldEnd beginIDRef='1'/>"
    require(inspect_sections([(prefix + duplicate + suffix).encode()])[3:5] == (2, 1), "ambiguous begin missed")
    crossing = "<p:fieldBegin id='1'/><p:fieldBegin id='2'/><p:fieldEnd beginIDRef='1'/><p:fieldEnd beginIDRef='2'/>"
    require(inspect_sections([(prefix + crossing + suffix).encode()])[0] != inspect_sections([(prefix + crossing.replace("beginIDRef='1'", "beginIDRef='2'", 1) + suffix).encode()])[0], "crossing link escaped digest")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("field marker oracle self-test passed")
    elif not sys.argv[1:]:
        expected, rejected, encrypted = expected_all()
        actual, actual_rejected, actual_encrypted, totals = product()
        require(set(actual) == set(expected), ("accepted set", set(actual) ^ set(expected)))
        require(actual_rejected == rejected, ("rejected set", actual_rejected ^ rejected))
        require(actual_encrypted == encrypted, ("encrypted set", actual_encrypted ^ encrypted))
        require(totals == (len(expected), len(rejected), len(encrypted)), totals)
        for key, row in expected.items():
            require(actual[key] == row, ("mismatch", key, actual[key], row))
        print(f"field marker corpus matched files={len(expected)} rejected={len(rejected)} encrypted={len(encrypted)} begins={sum(row[1] for row in expected.values())} ends={sum(row[2] for row in expected.values())} unmatched={sum(row[3] for row in expected.values())} unresolved={sum(row[4] for row in expected.values())} other_attributes={sum(row[5] for row in expected.values())}")
    else:
        raise SystemExit("usage: hwpx-field-markers-diff.py [--self-test]")
