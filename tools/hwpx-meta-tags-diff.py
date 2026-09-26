#!/usr/bin/env python3
"""Independent ZIP/ElementTree oracle for 2011 section hp:metaTag text."""

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
CASES = (
    "issue6145/worklife_balance_index_156607916.hwpx",
    "issue6451/underline_run_fragments.hwpx",
    "task2311/156744475_nano_plan_poster.hwpx",
    "issue6299/forest_press_wrap_seg_pairs.hwpx",
)
OPF = "{http://www.idpf.org/2007/opf/}"
PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"


def require(condition, evidence):
    if not condition:
        raise AssertionError(evidence)


def number(hash_obj, count):
    hash_obj.update(count.to_bytes(8, "little"))


def value(hash_obj, data):
    number(hash_obj, len(data))
    hash_obj.update(data)


def inspect_sections(sections):
    digest = hashlib.sha256()
    number(digest, len(sections))
    observed = []
    for ordinal, xml in enumerate(sections):
        root = ET.fromstring(xml)
        require(root.tag == SECTION, root.tag)
        parents = {child: parent for parent in root.iter() for child in parent}
        indices = {item: index for index, item in enumerate(root.iter())}
        for item in root.iter(PARA + "metaTag"):
            parent = parents.get(item)
            if parent is None:
                continue
            if parent.tag.startswith("{"):
                parent_uri, parent_local = parent.tag[1:].split("}", 1)
            else:
                parent_uri, parent_local = "", parent.tag
            direct = (item.text or "") + "".join(child.tail or "" for child in item)
            observed.append((ordinal, indices[parent], indices[item], parent_uri, parent_local, direct, len(item), len(item.attrib)))
    number(digest, len(observed))
    value_bytes = child_count = attribute_count = 0
    for ordinal, parent_index, index, parent_uri, parent_local, direct, children, attributes in observed:
        number(digest, ordinal)
        number(digest, parent_index)
        number(digest, index)
        value(digest, parent_uri.encode("utf-8"))
        value(digest, parent_local.encode("utf-8"))
        utf8 = direct.encode("utf-8")
        value(digest, utf8)
        number(digest, children)
        number(digest, attributes)
        value_bytes += len(utf8)
        child_count += children
        attribute_count += attributes
    return digest.hexdigest(), len(observed), value_bytes, child_count, attribute_count


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
        ["zig", "test", "src/hwpx_meta_tags_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX meta tags corpus per-file independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    accepted, rejected, encrypted = {}, set(), set()
    totals = None
    for line in result.stderr.splitlines():
        if "META_CORPUS_FILE " in line:
            _, root, path_hash, hash_value, *counts = line[line.index("META_CORPUS_FILE "):].split()
            require(len(counts) == 4, line)
            key = (int(root), path_hash)
            require(key not in accepted, key)
            accepted[key] = (hash_value, *(int(count) for count in counts))
        elif "META_CORPUS_REJECTED " in line:
            _, root, path_hash = line[line.index("META_CORPUS_REJECTED "):].split()
            rejected.add((int(root), path_hash))
        elif "META_CORPUS_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("META_CORPUS_ENCRYPTED "):].split()
            encrypted.add((int(root), path_hash))
        elif line.startswith("META_CORPUS_TOTAL "):
            totals = tuple(int(v) for v in line.split()[1:])
    return accepted, rejected, encrypted, totals


def compare(expected, rejected, encrypted, actual, actual_rejected, actual_encrypted, totals):
    require(set(actual) == set(expected), ("accepted set", set(actual) ^ set(expected)))
    require(actual_rejected == rejected, ("rejected set", actual_rejected ^ rejected))
    require(actual_encrypted == encrypted, ("encrypted set", actual_encrypted ^ encrypted))
    require(totals == (len(expected), len(rejected), len(encrypted)), totals)
    for key, row in expected.items():
        require(actual[key] == row, ("mismatch", key, actual[key], row))


def self_test():
    start = f"<s:sec xmlns:s='{SECTION[1:-4]}' xmlns:p='{PARA[1:-1]}' xmlns:x='urn:foreign'>"
    source = start + "<p:p><p:run><p:fieldBegin><p:metaTag>A&amp;<![CDATA[<]]>&#xAC00;</p:metaTag></p:fieldBegin></p:run></p:p></s:sec>"
    first = inspect_sections([source.encode()])
    require(first[0] == inspect_sections([source.replace("<![CDATA[<]]>", "&lt;").encode()])[0], "equivalent text differs")
    for changed in (
        source.replace("&#xAC00;", "&#xAC01;"),
        source.replace("<p:metaTag>", "<p:metaTag future='x'>"),
        source.replace("<p:metaTag>", "<p:metaTag><p:future/>"),
        source.replace("<p:fieldBegin>", "<p:equation>").replace("</p:fieldBegin>", "</p:equation>"),
        source.replace("<p:fieldBegin>", "<x:fieldBegin>").replace("</p:fieldBegin>", "</x:fieldBegin>"),
        source.replace("<p:metaTag>", "<x:metaTag>").replace("</p:metaTag>", "</x:metaTag>"),
    ):
        require(first[0] != inspect_sections([changed.encode()])[0], "mutation escaped digest")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("meta tags oracle self-test passed")
    elif not sys.argv[1:]:
        expected, rejected, encrypted = expected_all()
        actual, actual_rejected, actual_encrypted, totals = product()
        compare(expected, rejected, encrypted, actual, actual_rejected, actual_encrypted, totals)
        print(f"meta tags corpus matched files={len(expected)} rejected={len(rejected)} encrypted={len(encrypted)} tags={sum(row[1] for row in expected.values())} value_bytes={sum(row[2] for row in expected.values())}")
    else:
        raise SystemExit("usage: hwpx-meta-tags-diff.py [--self-test]")
