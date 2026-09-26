#!/usr/bin/env python3
"""Compare every supported local HWPX section text snapshot with ZIP/ElementTree."""

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
INLINE = {
    PARA + name: index
    for index, name in enumerate(("tab", "fwSpace", "nbSpace", "lineBreak", "titleMark", "markpenBegin", "markpenEnd", "hypen"))
}


def require(condition, detail):
    if not condition:
        raise AssertionError(detail)


def update_ordered(section, result):
    def content(value):
        if value is not None:
            for byte in value.encode("utf-8"):
                result.update(bytes((9, byte)))

    def visit(node, in_text=False):
        if in_text:
            kind = INLINE.get(node.tag, 8)
            result.update(bytes((7, kind)))
        elif node.tag == PARA + "p":
            result.update(b"\x01")
        elif node.tag == PARA + "run":
            result.update(b"\x03")
        elif node.tag == PARA + "t":
            result.update(b"\x05")
        owns_text = in_text or node.tag == PARA + "t"
        if owns_text:
            content(node.text)
        for child in node:
            visit(child, owns_text)
            if owns_text:
                content(child.tail)
        if in_text:
            result.update(bytes((8, kind)))
        elif node.tag == PARA + "p":
            result.update(b"\x02")
        elif node.tag == PARA + "run":
            result.update(b"\x04")
        elif node.tag == PARA + "t":
            result.update(b"\x06")

    visit(section)


def oracle():
    files = {}
    rejected_zip = set()
    encrypted = set()
    for root_index, root in enumerate(SOURCES):
        for path in root.rglob("*.hwpx"):
            require(path.stat().st_size <= 25_000_000, path)
            key = (root_index, hashlib.sha256(path.relative_to(root).as_posix().encode()).hexdigest())
            require(key not in files, path)
            try:
                with zipfile.ZipFile(path) as archive:
                    names = set(archive.namelist())
                    if "META-INF/manifest.xml" in names and b"encryption-data" in archive.read("META-INF/manifest.xml"):
                        encrypted.add(key)
                        continue
                    opf = ET.fromstring(archive.read("Contents/content.hpf"))
                    items = {item.get("id"): item.get("href") for item in opf.findall(OPF + "manifest/" + OPF + "item")}
                    spine = opf.find(OPF + "spine")
                    require(spine is not None, path)
                    payload = bytearray()
                    ordered = hashlib.sha256()
                    counts = [0, 0, 0, 0, 0, 0]
                    for entry in spine.findall(OPF + "itemref"):
                        name = items[entry.get("idref")]
                        if not name.endswith(".xml"):
                            continue
                        section = ET.fromstring(archive.read(name))
                        if section.tag != SECTION:
                            continue
                        update_ordered(section, ordered)
                        counts[0] += 1
                        counts[1] += sum(1 for _ in section.iter(PARA + "p"))
                        counts[2] += sum(1 for _ in section.iter(PARA + "run"))
                        for node in section.iter(PARA + "t"):
                            counts[3] += 1
                            encoded = "".join(node.itertext()).encode("utf-8")
                            counts[4] += not encoded
                            payload.extend(encoded)
                    counts[5] = len(payload)
                    files[key] = (hashlib.sha256(payload).hexdigest(), ordered.hexdigest(), *counts)
            except zipfile.BadZipFile:
                rejected_zip.add(key)
    return files, rejected_zip, encrypted


def product():
    result = subprocess.run(
        ["zig", "test", "src/hwpx_text_snapshot_corpus.zig", "-O", "ReleaseFast", "--test-filter", "HWPX section text snapshot corpus digest survey"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    files = {}
    rejected_zip = set()
    encrypted = set()
    totals = None
    for line in result.stderr.splitlines():
        if "SNAPSHOT_FILE " in line:
            _, root, path_hash, content_hash, order_hash, *counts = line[line.index("SNAPSHOT_FILE ") :].split()
            key = (int(root), path_hash)
            require(key not in files, key)
            files[key] = (content_hash, order_hash, *(int(value) for value in counts))
        elif "SNAPSHOT_REJECTED " in line:
            _, root, path_hash = line[line.index("SNAPSHOT_REJECTED ") :].split()
            rejected_zip.add((int(root), path_hash))
        elif "SNAPSHOT_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("SNAPSHOT_ENCRYPTED ") :].split()
            encrypted.add((int(root), path_hash))
        elif line.startswith("SNAPSHOT_TOTAL "):
            totals = tuple(int(value) for value in line.split()[1:])
    require(totals is not None, result.stderr[-2000:])
    return files, rejected_zip, encrypted, totals


def compare(expected, rejected_zip, encrypted, actual, actual_rejected, actual_encrypted, totals):
    require(set(actual) == set(expected), (len(actual), len(expected), list(set(actual) ^ set(expected))[:5]))
    require(actual_rejected == rejected_zip, ("rejected_zip", actual_rejected ^ rejected_zip))
    require(actual_encrypted == encrypted, ("encrypted", actual_encrypted ^ encrypted))
    require(not (set(expected) & rejected_zip or set(expected) & encrypted or rejected_zip & encrypted), "overlapping oracle classifications")
    for key in expected:
        require(actual[key] == expected[key], (key, actual[key], expected[key]))
    require(totals[:3] == (len(expected), len(rejected_zip), len(encrypted)), totals)
    require(totals[3:] == tuple(sum(row[index] for row in expected.values()) for index in range(2, 8)), totals)


def self_test():
    first = ET.fromstring("<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A<p:tab/>B</p:t></p:run></p:p></s:sec>")
    moved = ET.fromstring("<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>AB<p:tab/></p:t></p:run></p:p></s:sec>")
    left_order = hashlib.sha256()
    right_order = hashlib.sha256()
    update_ordered(first, left_order)
    update_ordered(moved, right_order)
    require("".join(first.itertext()) == "".join(moved.itertext()), "negative control changed plain text")
    require(left_order.digest() != right_order.digest(), "ordered digest missed moved text")
    key = (0, "a" * 64)
    row = ("b" * 64, "d" * 64, 1, 2, 3, 4, 1, 5)
    expected = {key: row}
    rejected = {(0, "e" * 64)}
    encrypted = {(0, "f" * 64)}
    totals = (1, 1, 1, 1, 2, 3, 4, 1, 5)
    compare(expected, rejected, encrypted, expected.copy(), rejected.copy(), encrypted.copy(), totals)
    bad_cases = (
        ({}, rejected, encrypted, totals),
        ({key: ("c" * 64, *row[1:])}, rejected, encrypted, totals),
        ({key: (row[0], "e" * 64, *row[2:])}, rejected, encrypted, totals),
        ({key: (*row[:-1], 6)}, rejected, encrypted, totals),
        (expected.copy(), encrypted, rejected, totals),
        (expected.copy(), rejected, encrypted, (1, 1, 3, *totals[3:])),
        (expected.copy(), rejected, encrypted, (*totals[:-1], 6)),
    )
    for files, rejected_result, encrypted_result, counts in bad_cases:
        try:
            compare(expected, rejected, encrypted, files, rejected_result, encrypted_result, counts)
        except AssertionError:
            continue
        raise AssertionError("corpus verifier missed a negative control")


def main():
    self_test()
    if sys.argv[1:] == ["--self-test"]:
        print("HWPX snapshot corpus verifier negative controls passed")
        return
    require(not sys.argv[1:], "unsupported arguments")
    expected, rejected_zip, encrypted = oracle()
    actual, actual_rejected, actual_encrypted, totals = product()
    compare(expected, rejected_zip, encrypted, actual, actual_rejected, actual_encrypted, totals)
    print("HWPX snapshot corpus documents={} rejected_zip={} encrypted={} sections={} paragraphs={} runs={} text_elements={} empty={} text_bytes={}".format(*totals))


if __name__ == "__main__":
    main()
