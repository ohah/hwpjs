#!/usr/bin/env python3
"""Compare every supported HWPX master-page snapshot with independent ZIP/XML."""

import hashlib
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

from hwpx_text_snapshot_order import CHART, PARA, RUN, require, update_ordered


ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = (
    ROOT / "legacy/rust/crates/hwp-core/tests/fixtures",
    ROOT / "reference/rhwp/samples",
)
OPF = "{http://www.idpf.org/2007/opf/}"
MASTER_PATH = re.compile(r"Contents/masterpage[0-9]+\.xml\Z")
MODES = {(): "raw", ("--selected-default",): "selected_default", ("--selected-chart",): "selected_chart"}


def inspect_master(xml, mode, payload, ordered, counts):
    master = ET.fromstring(xml)
    require(master.tag == "masterPage", ("unexpected master root", master.tag))
    counts[0] += 1
    counts[7] += len(xml)
    for child in master:
        if child.tag != PARA + "subList":
            continue
        counts[1] += 1
        scoped = [0, 0, 0, 0, 0, 0]
        start = len(payload)
        update_ordered(child, ordered, payload, scoped, mode)
        for dst, src in ((2, 1), (3, 2), (4, 3), (5, 4), (6, 5)):
            counts[dst] += scoped[src]
        if mode == "raw":
            direct_text = b"".join("".join(node.itertext()).encode("utf-8") for node in child.iter(PARA + "t"))
            require(bytes(payload[start:]) == direct_text, "raw text walk disagreement")
            require(scoped[1] == sum(1 for _ in child.iter(PARA + "p")), "raw paragraph count disagreement")
            require(scoped[2] == sum(1 for _ in child.iter(RUN)), "raw run count disagreement")
            require(scoped[3] == sum(1 for _ in child.iter(PARA + "t")), "raw text count disagreement")


def oracle(mode):
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
                    items = opf.findall(OPF + "manifest/" + OPF + "item")
                    payload = bytearray()
                    ordered = hashlib.sha256()
                    counts = [0] * 8
                    for item in items:
                        name = item.get("href")
                        if name is None or not MASTER_PATH.fullmatch(name):
                            continue
                        require(item.get("media-type") == "application/xml", (path, name, "media type"))
                        ordered.update(b"\x0a")
                        inspect_master(archive.read(name), mode, payload, ordered, counts)
                    require(counts[6] == len(payload), path)
                    files[key] = (hashlib.sha256(payload).hexdigest(), ordered.hexdigest(), *counts)
            except zipfile.BadZipFile:
                rejected_zip.add(key)
    return files, rejected_zip, encrypted


def product(mode):
    name = {
        "raw": "HWPX master text snapshot corpus digest survey raw",
        "selected_default": "HWPX master text snapshot corpus digest survey selected default",
        "selected_chart": "HWPX master text snapshot corpus digest survey selected chart",
    }[mode]
    result = subprocess.run(
        ["zig", "test", "src/hwpx_master_text_snapshot_corpus.zig", "-O", "ReleaseFast", "--test-filter", name],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    files = {}
    rejected_zip = set()
    encrypted = set()
    totals = None
    for line in result.stderr.splitlines():
        if "MASTER_SNAPSHOT_FILE " in line:
            _, observed_mode, root, path_hash, content_hash, order_hash, *counts = line[line.index("MASTER_SNAPSHOT_FILE "):].split()
            require(observed_mode == mode and len(counts) == 8, line)
            key = (int(root), path_hash)
            require(key not in files, key)
            files[key] = (content_hash, order_hash, *(int(value) for value in counts))
        elif "MASTER_SNAPSHOT_REJECTED " in line:
            _, observed_mode, root, path_hash = line[line.index("MASTER_SNAPSHOT_REJECTED "):].split()
            require(observed_mode == mode, line)
            rejected_zip.add((int(root), path_hash))
        elif "MASTER_SNAPSHOT_ENCRYPTED " in line:
            _, observed_mode, root, path_hash = line[line.index("MASTER_SNAPSHOT_ENCRYPTED "):].split()
            require(observed_mode == mode, line)
            encrypted.add((int(root), path_hash))
        elif line.startswith("MASTER_SNAPSHOT_TOTAL "):
            _, observed_mode, *values = line.split()
            require(observed_mode == mode and len(values) == 11, line)
            totals = tuple(int(value) for value in values)
    require(totals is not None, result.stderr[-2000:])
    return files, rejected_zip, encrypted, totals


def compare(expected, rejected, encrypted, actual, actual_rejected, actual_encrypted, totals):
    require(set(actual) == set(expected), ("file set", len(actual), len(expected), list(set(actual) ^ set(expected))[:5]))
    require(actual_rejected == rejected, ("rejected", actual_rejected ^ rejected))
    require(actual_encrypted == encrypted, ("encrypted", actual_encrypted ^ encrypted))
    require(not (set(expected) & rejected or set(expected) & encrypted or rejected & encrypted), "overlapping classifications")
    for key, row in expected.items():
        require(actual[key] == row, (key, actual[key], row))
    require(totals[:3] == (len(expected), len(rejected), len(encrypted)), totals)
    require(totals[3:] == tuple(sum(row[index] for row in expected.values()) for index in range(2, 10)), totals)


def self_test():
    prefix = "<masterPage xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>"
    left = (prefix + "<x:subList><p:p><p:run><p:t>omit</p:t></p:run></p:p></x:subList>"
            "<p:subList><p:p><p:run><p:t>A<p:tab/>B</p:t></p:run></p:p></p:subList>"
            "<p:outside><p:p><p:run><p:t>skip</p:t></p:run></p:p></p:outside></masterPage>").encode()
    right = left.replace(b"A<p:tab/>B", b"AB<p:tab/>")
    rows = []
    for xml in (left, right):
        payload = bytearray()
        order = hashlib.sha256()
        counts = [0] * 8
        inspect_master(xml, "raw", payload, order, counts)
        rows.append((bytes(payload), order.digest(), counts))
    require(rows[0][0] == rows[1][0] == b"AB", "scope or content error")
    require(rows[0][1] != rows[1][1], "event-order digest missed moved tab")
    require(rows[0][2][:7] == [1, 1, 1, 1, 1, 0, 2], rows[0][2])
    empty_xml = (prefix + "</masterPage>").encode()
    text_xml = (prefix + "<p:subList><p:p><p:run><p:t>A</p:t></p:run></p:p></p:subList></masterPage>").encode()
    part_hashes = []
    for parts in ((text_xml, empty_xml), (empty_xml, text_xml)):
        order = hashlib.sha256()
        payload = bytearray()
        counts = [0] * 8
        for part in parts:
            order.update(b"\x0a")
            inspect_master(part, "raw", payload, order, counts)
        require(payload == b"A" and counts[0] == 2, "part-boundary control changed content or part count")
        part_hashes.append(order.digest())
    require(part_hashes[0] != part_hashes[1], "part-boundary digest missed reassigned text")
    switched = (prefix + "<p:subList><p:p><p:run><p:switch>"
                "<p:case p:required-namespace='" + CHART + "'><p:t>X</p:t></p:case>"
                "<p:default><p:t>Y</p:t></p:default>"
                "</p:switch></p:run></p:p></p:subList></masterPage>").encode()
    switched_payloads = []
    for mode in ("raw", "selected_default", "selected_chart"):
        payload = bytearray()
        inspect_master(switched, mode, payload, hashlib.sha256(), [0] * 8)
        switched_payloads.append(bytes(payload))
    require(switched_payloads == [b"XY", b"Y", b"X"], switched_payloads)
    key = (0, "a" * 64)
    row = ("b" * 64, "c" * 64, 1, 1, 1, 1, 1, 0, 2, 100)
    expected = {key: row}
    rejected = {(0, "d" * 64)}
    encrypted = {(0, "e" * 64)}
    totals = (1, 1, 1, *row[2:])
    compare(expected, rejected, encrypted, expected.copy(), rejected.copy(), encrypted.copy(), totals)
    bad_cases = (
        ({}, rejected, encrypted, totals),
        ({key: ("f" * 64, *row[1:])}, rejected, encrypted, totals),
        ({key: (row[0], "f" * 64, *row[2:])}, rejected, encrypted, totals),
        ({key: (*row[:-1], 101)}, rejected, encrypted, totals),
        (expected, encrypted, rejected, totals),
        (expected, rejected, encrypted, (*totals[:-1], 101)),
    )
    for files, bad_rejected, bad_encrypted, bad_totals in bad_cases:
        try:
            compare(expected, rejected, encrypted, files, bad_rejected, bad_encrypted, bad_totals)
        except AssertionError:
            continue
        raise AssertionError("verifier missed a negative control")


def main():
    self_test()
    if sys.argv[1:] == ["--self-test"]:
        print("HWPX master snapshot corpus verifier negative controls passed")
        return
    mode = MODES.get(tuple(sys.argv[1:]))
    require(mode is not None, "unsupported arguments")
    expected, rejected, encrypted = oracle(mode)
    actual, actual_rejected, actual_encrypted, totals = product(mode)
    compare(expected, rejected, encrypted, actual, actual_rejected, actual_encrypted, totals)
    print("HWPX master snapshot mode={} documents={} rejected_zip={} encrypted={} parts={} sub_lists={} paragraphs={} runs={} text_elements={} empty={} text_bytes={} xml_bytes={}".format(mode, *totals))


if __name__ == "__main__":
    main()
