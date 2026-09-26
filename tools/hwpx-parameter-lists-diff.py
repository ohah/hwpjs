#!/usr/bin/env python3
"""Compare selected HWPX parameter trees with independent ZIP/ElementTree."""

import hashlib
import pathlib
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "reference/rhwp/samples"
SOURCES = (ROOT / "legacy/rust/crates/hwp-core/tests/fixtures", SAMPLES)
CASES = (
    "issue3637/press_release_topbottom_float.hwpx",
    "issue5731/cell_second_float_flow_anchor.hwpx",
    "issue2373/156689818_kftc_press.hwpx",
)
OPF = "{http://www.idpf.org/2007/opf/}"
PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
KINDS = ("parameterset", "booleanParam", "integerParam", "unsignedintegerParam", "bindataParam", "floatParam", "stringParam", "listParam", "arrayParam", "parameters")
ROOT_KINDS = {"parameterset", "parameters"}
CHILD_KINDS = set(KINDS[1:9])
LIST_KINDS = {"parameterset", "parameters", "listParam", "arrayParam"}
OWNER = {"pic": 0, "container": 1, "equation": 2}


def require(condition, evidence):
    if not condition:
        raise AssertionError(evidence)


def number(hash_obj, count):
    hash_obj.update(count.to_bytes(8, "little"))


def value(hash_obj, data):
    number(hash_obj, len(data))
    hash_obj.update(data)


def optional(hash_obj, data):
    if data is None:
        hash_obj.update(b"\x00")
    else:
        hash_obj.update(b"\x01")
        value(hash_obj, data.encode("utf-8"))


def inspect_sections(sections):
    digest = hashlib.sha256()
    number(digest, len(sections))
    all_roots = []
    for ordinal, xml in enumerate(sections):
        root = ET.fromstring(xml)
        require(root.tag == SECTION, root.tag)
        parents = {child: parent for parent in root.iter() for child in parent}
        indices = {item: index for index, item in enumerate(root.iter())}
        for item in root.iter():
            if item.tag not in {PARA + kind for kind in ROOT_KINDS}:
                continue
            parent = parents.get(item)
            if parent is None:
                continue
            if item.tag == PARA + "parameters" and parent.tag != PARA + "fieldBegin":
                continue
            if parent.tag.startswith("{"):
                parent_uri, owner_local = parent.tag[1:].split("}", 1)
            else:
                parent_uri, owner_local = "", parent.tag
            nodes = []

            def visit(node, parent_index, depth):
                local = node.tag[len(PARA):]
                kind = KINDS.index(local)
                index = len(nodes)
                nodes.append((node, parent_index, depth, kind))
                if local in LIST_KINDS:
                    for child in node:
                        if child.tag.startswith(PARA) and child.tag[len(PARA):] in CHILD_KINDS:
                            visit(child, index, depth + 1)

            visit(item, None, 0)
            owner = OWNER.get(owner_local, 3) if parent_uri == PARA[1:-1] else 3
            all_roots.append((ordinal, indices[parent], indices[item], owner, parent_uri, owner_local, nodes, indices))
    number(digest, len(all_roots))
    total_nodes = value_bytes = unknown = mismatches = 0
    for ordinal, parent_index, element_index, owner, parent_uri, parent_local, nodes, indices in all_roots:
        number(digest, ordinal)
        number(digest, parent_index)
        number(digest, element_index)
        number(digest, owner)
        value(digest, parent_uri.encode("utf-8"))
        value(digest, parent_local.encode("utf-8"))
        number(digest, len(nodes))
        total_nodes += len(nodes)
        for item, parent_node, depth, kind in nodes:
            local = KINDS[kind]
            children = list(item)
            unrecognized = sum(local not in LIST_KINDS or child.tag not in {PARA + name for name in CHILD_KINDS} for child in children)
            declared = item.get("cnt")
            mismatch = declared is not None and local in LIST_KINDS and int(declared) != len(children)
            direct = None if local in LIST_KINDS else (item.text or "") + "".join(child.tail or "" for child in children)
            number(digest, indices[item])
            number(digest, parent_node + 1 if parent_node is not None else 0)
            number(digest, depth)
            number(digest, kind)
            optional(digest, item.get("name"))
            optional(digest, declared)
            optional(digest, direct)
            number(digest, len(children))
            number(digest, unrecognized)
            number(digest, mismatch)
            unknown += unrecognized
            mismatches += mismatch
            value_bytes += len(direct.encode("utf-8")) if direct is not None else 0
    return digest.hexdigest(), len(all_roots), total_nodes, value_bytes, unknown, mismatches


def oracle_at(path):
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


def oracle(relative):
    return oracle_at(SAMPLES / relative)


def all_oracle():
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
                accepted[key] = oracle_at(path)
            except zipfile.BadZipFile:
                rejected.add(key)
    return accepted, rejected, encrypted


def self_test():
    start = f"<s:sec xmlns:s='{SECTION[1:-4]}' xmlns:p='{PARA[1:-1]}' xmlns:x='urn:foreign'>"
    source = start + "<p:p><p:run><p:pic><p:parameterset cnt='1' name=''><p:listParam cnt='1' name='g'><p:stringParam name='s'>A&amp;<![CDATA[<]]></p:stringParam></p:listParam></p:parameterset></p:pic></p:run></p:p></s:sec>"
    first = inspect_sections([source.encode()])
    require(first[0] == inspect_sections([source.replace("<![CDATA[<]]>", "&lt;").encode()])[0], "equivalent text differs")
    for changed in (
        source.replace("cnt='1' name=''", "cnt='2' name=''"),
        source.replace("name='g'", "name=''"),
        source.replace("A&amp;", "B&amp;"),
        source.replace("<p:pic>", "<p:equation>").replace("</p:pic>", "</p:equation>"),
        source.replace("<p:pic>", "<x:pic>").replace("</p:pic>", "</x:pic>"),
        source.replace("<p:stringParam", "<x:stringParam").replace("</p:stringParam>", "</x:stringParam>"),
        source.replace("<p:stringParam name='s'>", "<p:stringParam name='s'><p:future/>")
    ):
        require(first[0] != inspect_sections([changed.encode()])[0], "mutation escaped digest")
    field = start + "<p:fieldBegin><p:parameters cnt='1'><p:stringParam name='s'>A&amp;<![CDATA[<]]></p:stringParam></p:parameters></p:fieldBegin></s:sec>"
    field_digest = inspect_sections([field.encode()])
    require(field_digest[1:4] == (1, 2, 3), "field parameter summary")
    require(field_digest[0] == inspect_sections([field.replace("<![CDATA[<]]>", "&lt;").encode()])[0], "field equivalent text differs")
    for changed in (
        field.replace("<p:parameters", "<x:parameters").replace("</p:parameters>", "</x:parameters>"),
        field.replace("<p:fieldBegin>", "<x:fieldBegin>").replace("</p:fieldBegin>", "</x:fieldBegin>"),
        field.replace("cnt='1'", "cnt='2'"),
        field.replace("A&amp;", "B&amp;"),
        field.replace("<p:stringParam", "<x:stringParam").replace("</p:stringParam>", "</x:stringParam>"),
        field.replace("</p:stringParam>", "<p:future/></p:stringParam>"),
    ):
        require(field_digest[0] != inspect_sections([changed.encode()])[0], "field mutation escaped digest")


def main():
    result = subprocess.run(
        ["zig", "test", "src/hwpx_parameter_lists_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX parameter lists three real files independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    actual = {}
    for line in result.stderr.splitlines():
        if "PARAM_FILE " in line:
            _, relative, hash_value, *counts = line[line.index("PARAM_FILE "):].split()
            require(len(counts) == 5 and relative not in actual, line)
            actual[relative] = (hash_value, *(int(count) for count in counts))
    require(set(actual) == set(CASES), ("file set", set(actual)))
    for relative in CASES:
        expected = oracle(relative)
        require(actual[relative] == expected, (relative, actual[relative], expected))
    print(f"parameter lists matched files={len(CASES)} roots={sum(actual[p][1] for p in CASES)} nodes={sum(actual[p][2] for p in CASES)} value_bytes={sum(actual[p][3] for p in CASES)}")


def all_main():
    expected, rejected, encrypted = all_oracle()
    result = subprocess.run(
        ["zig", "test", "src/hwpx_parameter_lists_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX parameter lists corpus per-file independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    actual, actual_rejected, actual_encrypted = {}, set(), set()
    totals = None
    for line in result.stderr.splitlines():
        if "PARAM_CORPUS_FILE " in line:
            _, root, path_hash, hash_value, *counts = line[line.index("PARAM_CORPUS_FILE "):].split()
            require(len(counts) == 5, line)
            key = (int(root), path_hash)
            require(key not in actual, key)
            actual[key] = (hash_value, *(int(count) for count in counts))
        elif "PARAM_CORPUS_REJECTED " in line:
            _, root, path_hash = line[line.index("PARAM_CORPUS_REJECTED "):].split()
            actual_rejected.add((int(root), path_hash))
        elif "PARAM_CORPUS_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("PARAM_CORPUS_ENCRYPTED "):].split()
            actual_encrypted.add((int(root), path_hash))
        elif line.startswith("PARAM_CORPUS_TOTAL "):
            totals = tuple(int(v) for v in line.split()[1:])
    require(set(actual) == set(expected), ("accepted file set", set(actual) ^ set(expected)))
    require(actual_rejected == rejected, ("rejected", actual_rejected ^ rejected))
    require(actual_encrypted == encrypted, ("encrypted", actual_encrypted ^ encrypted))
    require(totals == (len(expected), len(rejected), len(encrypted)), totals)
    for key, row in expected.items():
        require(actual[key] == row, ("mismatch", key, actual[key], row))
    print(f"parameter lists corpus matched files={len(expected)} rejected={len(rejected)} encrypted={len(encrypted)} roots={sum(row[1] for row in expected.values())} nodes={sum(row[2] for row in expected.values())}")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("parameter lists oracle self-test passed")
    elif not sys.argv[1:]:
        main()
    elif sys.argv[1:] == ["--all"]:
        all_main()
    else:
        raise SystemExit("usage: hwpx-parameter-lists-diff.py [--self-test|--all]")
