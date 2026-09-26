#!/usr/bin/env python3
"""Independent ZIP/ElementTree oracle for section indexmark/dutmal strings."""

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
CONTROL_KINDS = {PARA + "indexmark": 0, PARA + "dutmal": 1}
TEXT_KINDS = {
    PARA + "indexmark": {PARA + "firstKey": 0, PARA + "secondKey": 1},
    PARA + "dutmal": {PARA + "mainText": 2, PARA + "subText": 3},
}
ATTRIBUTES = ("posType", "szRatio", "option", "styleIDRef", "align")


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


def direct(item):
    return (item.text or "") + "".join(child.tail or "" for child in item)


def inspect_sections(sections):
    digest = hashlib.sha256()
    number(digest, len(sections))
    observed = []
    for ordinal, xml in enumerate(sections):
        section = ET.fromstring(xml)
        require(section.tag == SECTION, section.tag)
        parents = {child: parent for parent in section.iter() for child in parent}
        indices = {item: index for index, item in enumerate(section.iter())}
        for item in section.iter():
            if item.tag not in CONTROL_KINDS:
                continue
            parent = parents.get(item)
            if parent is None:
                continue
            if parent.tag.startswith("{"):
                parent_uri, parent_local = parent.tag[1:].split("}", 1)
            else:
                parent_uri, parent_local = "", parent.tag
            texts = [(child, TEXT_KINDS[item.tag][child.tag]) for child in item if child.tag in TEXT_KINDS[item.tag]]
            known_attrs = ATTRIBUTES if item.tag == PARA + "dutmal" else ()
            observed.append((ordinal, indices[parent], indices[item], CONTROL_KINDS[item.tag],
                             parent_uri, parent_local, item, texts, indices,
                             len(item) - len(texts), len(item.attrib.keys() - known_attrs)))
    number(digest, len(observed))
    text_count = value_bytes = unknown = other_attrs = 0
    for ordinal, parent_index, index, kind, parent_uri, parent_local, item, texts, indices, missing, extras in observed:
        number(digest, ordinal)
        number(digest, parent_index)
        number(digest, index)
        number(digest, kind)
        value(digest, parent_uri.encode("utf-8"))
        value(digest, parent_local.encode("utf-8"))
        root_text = direct(item).encode("utf-8")
        value(digest, root_text)
        value_bytes += len(root_text)
        for name in ATTRIBUTES:
            optional(digest, item.get(name) if kind == 1 else None)
        number(digest, len(item))
        number(digest, missing)
        number(digest, extras)
        number(digest, len(texts))
        unknown += missing
        other_attrs += extras
        text_count += len(texts)
        for child, child_kind in texts:
            number(digest, indices[child])
            number(digest, child_kind)
            data = direct(child).encode("utf-8")
            value(digest, data)
            number(digest, len(child))
            number(digest, len(child.attrib))
            value_bytes += len(data)
            other_attrs += len(child.attrib)
    return digest.hexdigest(), len(observed), text_count, value_bytes, unknown, other_attrs


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
            key = (root_index, hashlib.sha256(path.relative_to(root).as_posix().encode()).hexdigest())
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
        ["zig", "test", "src/hwpx_inline_string_controls_survey.zig", "-O", "ReleaseFast",
         "--test-filter", "HWPX inline string controls corpus per-file independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    accepted, rejected, encrypted = {}, set(), set()
    totals = None
    for line in result.stderr.splitlines():
        if "INLINE_CORPUS_FILE " in line:
            _, root, path_hash, hash_value, *counts = line[line.index("INLINE_CORPUS_FILE "):].split()
            require(len(counts) == 5, line)
            key = (int(root), path_hash)
            require(key not in accepted, key)
            accepted[key] = (hash_value, *(int(count) for count in counts))
        elif "INLINE_CORPUS_REJECTED " in line:
            _, root, path_hash = line[line.index("INLINE_CORPUS_REJECTED "):].split()
            rejected.add((int(root), path_hash))
        elif "INLINE_CORPUS_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("INLINE_CORPUS_ENCRYPTED "):].split()
            encrypted.add((int(root), path_hash))
        elif line.startswith("INLINE_CORPUS_TOTAL "):
            totals = tuple(int(v) for v in line.split()[1:])
    return accepted, rejected, encrypted, totals


def self_test():
    start = f"<s:sec xmlns:s='{SECTION[1:-4]}' xmlns:p='{PARA[1:-1]}' xmlns:x='urn:foreign'>"
    source = start + "<p:p><p:run><p:indexmark>root<p:firstKey>A&amp;<![CDATA[<]]></p:firstKey><p:secondKey>B</p:secondKey></p:indexmark><p:dutmal posType='TOP' align='CENTER'><p:mainText>main</p:mainText><p:subText>sub</p:subText></p:dutmal></p:run></p:p></s:sec>"
    first = inspect_sections([source.encode()])
    require(first[1:4] == (2, 4, 15), first)
    require(first[0] == inspect_sections([source.replace("<![CDATA[<]]>", "&lt;").encode()])[0], "equivalent text differs")
    for changed in (
        source.replace("A&amp;", "B&amp;"),
        source.replace("root<p:firstKey>", "boot<p:firstKey>"),
        source.replace("<p:secondKey>B", "<p:secondKey>C"),
        source.replace("posType='TOP'", "posType='BOTTOM'"),
        source.replace("align='CENTER'", "align='LEFT'"),
        source.replace("<p:firstKey", "<x:firstKey").replace("</p:firstKey>", "</x:firstKey>"),
        source.replace("<p:indexmark>", "<x:indexmark>").replace("</p:indexmark>", "</x:indexmark>"),
        source.replace("<p:mainText>", "<p:secondKey>").replace("</p:mainText>", "</p:secondKey>"),
        source.replace("<p:subText>", "<p:subText future='x'>"),
        source.replace("</p:subText>", "<p:future/></p:subText>"),
        source.replace("<p:indexmark>", "<p:indexmark><p:future/>"),
    ):
        require(first[0] != inspect_sections([changed.encode()])[0], "mutation escaped digest")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("inline string controls oracle self-test passed")
    elif not sys.argv[1:]:
        expected, rejected, encrypted = expected_all()
        actual, actual_rejected, actual_encrypted, totals = product()
        require(set(actual) == set(expected), ("accepted set", set(actual) ^ set(expected)))
        require(actual_rejected == rejected, ("rejected set", actual_rejected ^ rejected))
        require(actual_encrypted == encrypted, ("encrypted set", actual_encrypted ^ encrypted))
        require(totals == (len(expected), len(rejected), len(encrypted)), totals)
        for key, row in expected.items():
            require(actual[key] == row, ("mismatch", key, actual[key], row))
        print(f"inline string controls corpus matched files={len(expected)} rejected={len(rejected)} encrypted={len(encrypted)} controls={sum(row[1] for row in expected.values())} texts={sum(row[2] for row in expected.values())} value_bytes={sum(row[3] for row in expected.values())}")
    else:
        raise SystemExit("usage: hwpx-inline-string-controls-diff.py [--self-test]")
