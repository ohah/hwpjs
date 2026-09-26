#!/usr/bin/env python3
"""Compare Zig equation field/script order against independent ZIP/ElementTree."""

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
FIELDS = ("version", "baseLine", "textColor", "baseUnit", "lineMode", "font")
INHERITED = ("id", "zOrder", "numberingType", "textWrap", "textFlow", "lock", "dropcapstyle")


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
    totals = [len(sections), 0, 0, 0, 0, 0, 0, 0]
    for ordinal, xml in enumerate(sections):
        root = ET.fromstring(xml)
        require(root.tag == SECTION, (ordinal, root.tag))
        parents = {child: parent for parent in root.iter() for child in parent}
        for item in root.iter(PARA + "equation"):
            parent = parents.get(item)
            if parent is None or parent.tag != PARA + "run":
                continue
            totals[1] += 1
            number(digest, ordinal)
            for name in FIELDS:
                if name in item.attrib:
                    digest.update(b"\x01")
                    value(digest, item.attrib[name].encode("utf-8"))
                else:
                    digest.update(b"\x00")
            scripts = [child for child in item if child.tag == PARA + "script"]
            number(digest, len(scripts))
            totals[2] += len(scripts)
            totals[4] += not scripts
            totals[5] += len(scripts) > 1
            for script in scripts:
                require(len(script) == 0, "nested script not supported by product")
                text = (script.text or "").encode("utf-8")
                value(digest, text)
                totals[3] += len(text)
            other = len(item) - len(scripts)
            number(digest, other)
            totals[6] += other
            totals[7] += sum(name not in FIELDS and name not in INHERITED for name in item.attrib)
    return (digest.hexdigest(), *totals)


def oracle():
    accepted, rejected, encrypted = {}, set(), set()
    for root_index, root in enumerate(SOURCES):
        for path in root.rglob("*.hwpx"):
            require(path.stat().st_size <= 25_000_000, path)
            key = (root_index, hashlib.sha256(path.relative_to(root).as_posix().encode()).hexdigest())
            require(key not in accepted, key)
            try:
                with zipfile.ZipFile(path) as archive:
                    if "META-INF/manifest.xml" in archive.namelist() and b"encryption-data" in archive.read("META-INF/manifest.xml"):
                        encrypted.add(key)
                        continue
                    opf = ET.fromstring(archive.read("Contents/content.hpf"))
                    manifest = {item.get("id"): item for item in opf.findall(OPF + "manifest/" + OPF + "item")}
                    sections = []
                    for item_ref in opf.findall(OPF + "spine/" + OPF + "itemref"):
                        item = manifest[item_ref.get("idref")]
                        if item.get("media-type") != "application/xml":
                            continue
                        xml = archive.read(item.get("href"))
                        if ET.fromstring(xml).tag == SECTION:
                            sections.append(xml)
                    accepted[key] = inspect_sections(sections)
            except zipfile.BadZipFile:
                rejected.add(key)
    return accepted, rejected, encrypted


def product():
    result = subprocess.run(
        ["zig", "test", "src/hwpx_equation_corpus.zig", "-O", "ReleaseFast", "--test-filter", "HWPX equation corpus"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    accepted, rejected, encrypted = {}, set(), set()
    totals = None
    for line in result.stderr.splitlines():
        if "EQUATION_FILE " in line:
            _, root, path_hash, field_hash, *counts = line[line.index("EQUATION_FILE "):].split()
            require(len(counts) == 8, line)
            key = (int(root), path_hash)
            require(key not in accepted, key)
            accepted[key] = (field_hash, *(int(count) for count in counts))
        elif "EQUATION_REJECTED " in line:
            _, root, path_hash = line[line.index("EQUATION_REJECTED "):].split()
            rejected.add((int(root), path_hash))
        elif "EQUATION_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("EQUATION_ENCRYPTED "):].split()
            encrypted.add((int(root), path_hash))
        elif line.startswith("EQUATION_TOTAL "):
            totals = tuple(int(value) for value in line.split()[1:])
    require(totals is not None and len(totals) == 11, result.stderr[-2000:])
    return accepted, rejected, encrypted, totals


def compare(expected, rejected, encrypted, actual, actual_rejected, actual_encrypted, totals):
    require(set(actual) == set(expected), ("file set", set(actual) ^ set(expected)))
    require(actual_rejected == rejected, ("rejected", actual_rejected ^ rejected))
    require(actual_encrypted == encrypted, ("encrypted", actual_encrypted ^ encrypted))
    require(not (set(expected) & rejected or set(expected) & encrypted or rejected & encrypted), "classification overlap")
    for key, row in expected.items():
        require(actual[key] == row, ("mismatch", key, actual[key], row))
    require(totals[:3] == (len(expected), len(rejected), len(encrypted)), totals)
    require(totals[3:] == tuple(sum(row[index] for row in expected.values()) for index in range(1, 9)), totals)


def self_test():
    open_tag = f"<s:sec xmlns:s='{SECTION[1:-4]}' xmlns:p='{PARA[1:-1]}'>"
    a = open_tag + "<p:p><p:run><p:equation version=''><p:script><![CDATA[a < b]]>&amp;c</p:script></p:equation></p:run></p:p></s:sec>"
    first = inspect_sections([a.encode()])
    require(first[0] != inspect_sections([a.replace("version=''", "").encode()])[0], "absent/empty field escaped digest")
    require(first[0] != inspect_sections([a.replace("a < b", "a > b").encode()])[0], "script mutation escaped digest")
    require(first[0] == inspect_sections([a.replace("<![CDATA[a < b]]>", "a &lt; b").encode()])[0], "equivalent XML text differs")
    require(first[1:5] == (1, 1, 1, 7), first)
    empty = (open_tag + "</s:sec>").encode()
    require(inspect_sections([empty, a.encode()])[0] != first[0], "section placement escaped digest")
    require(inspect_sections([a.replace("version=''", "version='' future='x'").encode()])[-1] == 1, "other attribute count escaped")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("equation oracle self-test passed")
    elif not sys.argv[1:]:
        expected, rejected, encrypted = oracle()
        actual, actual_rejected, actual_encrypted, totals = product()
        compare(expected, rejected, encrypted, actual, actual_rejected, actual_encrypted, totals)
        positive = sum(row[2] > 0 for row in expected.values())
        print(f"matched files={len(expected)} rejected={len(rejected)} encrypted={len(encrypted)} positive={positive} sections={totals[3]} equations={totals[4]} scripts={totals[5]} bytes={totals[6]}")
    else:
        raise SystemExit("usage: hwpx-equation-corpus-diff.py [--self-test]")
