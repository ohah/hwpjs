#!/usr/bin/env python3
"""Independent ZIP/ElementTree check of HWPX note ancestor sites."""

import hashlib
import pathlib
import subprocess
import sys
import xml.etree.ElementTree as ET
import xml.parsers.expat as expat
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = (ROOT / "legacy/rust/crates/hwp-core/tests/fixtures", ROOT / "reference/rhwp/samples")
OPF = "{http://www.idpf.org/2007/opf/}"
PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
KINDS = {PARA + "footNote": 0, PARA + "endNote": 1}
ANCESTORS = (PARA + "p", PARA + "run", PARA + "t", PARA + "subList", PARA + "footNote", PARA + "endNote")


def require(condition, detail):
    if not condition:
        raise AssertionError(detail)


def number(h, n):
    h.update(n.to_bytes(8, "little"))


def optional_index(h, value):
    if value is None:
        h.update(b"\0")
    else:
        h.update(b"\1")
        number(h, value)


def element_offsets(raw):
    parser = expat.ParserCreate(namespace_separator="}")
    offsets = []
    parser.StartElementHandler = lambda name, attributes: offsets.append(parser.CurrentByteIndex)
    parser.Parse(raw, True)
    return offsets


def selected_sections(archive):
    opf = ET.fromstring(archive.read("Contents/content.hpf"))
    items = {item.get("id"): item for item in opf.findall(OPF + "manifest/" + OPF + "item")}
    sections = []
    for ref in opf.findall(OPF + "spine/" + OPF + "itemref"):
        item = items[ref.get("idref")]
        if item.get("media-type") != "application/xml":
            continue
        raw = archive.read(item.get("href"))
        root = ET.fromstring(raw)
        if root.tag == SECTION:
            sections.append((root, element_offsets(raw)))
    return sections


def digest_sections(sections):
    records = []
    counts = [0] * 6
    for ordinal, (root, offsets) in enumerate(sections):
        elements = list(root.iter())
        require(len(offsets) == len(elements), "independent XML element index disagreement")
        indices = {element: index for index, element in enumerate(elements)}
        parents = {child: parent for parent in elements for child in parent}
        for element in elements:
            if element.tag not in KINDS or element not in parents:
                continue
            parent = parents[element]
            found = [None] * 5
            cursor = parent
            while True:
                if cursor.tag in ANCESTORS[:4]:
                    slot = ANCESTORS.index(cursor.tag)
                    if found[slot] is None:
                        found[slot] = indices[cursor]
                if cursor.tag in ANCESTORS[4:] and found[4] is None:
                    found[4] = indices[cursor]
                if cursor not in parents:
                    break
                cursor = parents[cursor]
            values = (
                indices[parent] if parent.tag == PARA + "ctrl" else None,
                found[0], found[1], found[2], found[3], found[4],
            )
            counts = [old + int(value is not None) for old, value in zip(counts, values)]
            records.append((KINDS[element.tag], ordinal, indices[element], indices[parent], offsets[indices[element]], values))
    digest = hashlib.sha256()
    number(digest, len(sections))
    number(digest, len(records))
    for kind, ordinal, index, parent, byte_offset, values in records:
        for value in (kind, ordinal, index, parent, byte_offset):
            number(digest, value)
        for value in values:
            optional_index(digest, value)
    return digest.hexdigest(), len(records), *counts


def expected():
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
                    accepted[key] = digest_sections(selected_sections(archive))
            except zipfile.BadZipFile:
                rejected.add(key)
    return accepted, rejected, encrypted


def product():
    run = subprocess.run(
        ["zig", "test", "src/hwpx_note_bodies_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX note bodies corpus per-file independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(run.returncode == 0, run.stderr[-4000:])
    accepted, rejected, encrypted = {}, set(), set()
    for line in run.stderr.splitlines():
        if "NOTE_SITE_FILE " in line:
            _, root, path, digest, *values = line[line.index("NOTE_SITE_FILE "):].split()
            require(len(values) == 7, line)
            key = int(root), path
            require(key not in accepted, key)
            accepted[key] = (digest, *(int(value) for value in values))
        elif "NOTE_CORPUS_REJECTED " in line:
            _, root, path = line[line.index("NOTE_CORPUS_REJECTED "):].split()
            rejected.add((int(root), path))
        elif "NOTE_CORPUS_ENCRYPTED " in line:
            _, root, path = line[line.index("NOTE_CORPUS_ENCRYPTED "):].split()
            encrypted.add((int(root), path))
    return accepted, rejected, encrypted


def self_test():
    start = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>"
    xml = start + "<p:p><p:run><p:ctrl><p:footNote/></p:ctrl></p:run></p:p></s:sec>"
    def parsed(source):
        raw = source.encode("utf-8")
        return ET.fromstring(raw), element_offsets(raw)

    baseline = digest_sections([parsed(xml)])
    variants = (
        xml.replace("<p:ctrl>", "<x:ctrl>").replace("</p:ctrl>", "</x:ctrl>"),
        xml.replace("<p:run>", "<x:run>").replace("</p:run>", "</x:run>"),
        xml.replace("<p:p>", "<x:p>").replace("</p:p>", "</x:p>"),
        xml.replace("<p:footNote/>", "<p:endNote/>"),
        xml.replace("<p:footNote/>", "<p:t><p:footNote/></p:t>"),
        xml.replace("<p:footNote/>", "<p:subList><p:footNote/></p:subList>"),
        xml.replace("<p:footNote/>", "<p:footNote><p:subList><p:endNote/></p:subList></p:footNote>"),
        xml.replace("<p:footNote/>", "<x:before/><p:footNote/>"),
    )
    for variant in variants:
        require(digest_sections([parsed(variant)]) != baseline, variant)
    equivalent = xml.replace("<p:footNote/>", "<p:footNote></p:footNote>")
    require(digest_sections([parsed(equivalent)]) == baseline, "equivalent empty tag")
    for codec, bom in (("utf-16le", b"\xff\xfe"), ("utf-16be", b"\xfe\xff")):
        utf16 = "<?xml version='1.0' encoding='" + codec.upper() + "'?>" + xml
        raw16 = bom + utf16.encode(codec)
        result16 = digest_sections([(ET.fromstring(raw16), element_offsets(raw16))])
        require(result16[1:] == baseline[1:] and result16[0] != baseline[0], codec)
    print(f"note site oracle detected {len(variants)} mutations, one equivalent spelling and both UTF-16 byte orders")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif not sys.argv[1:]:
        reference = expected()
        observed = product()
        for left, right, name in zip(reference, observed, ("accepted", "rejected", "encrypted")):
            require(left == right, f"{name} mismatch: expected {len(left)} observed {len(right)}; first={next(iter(left.items() ^ right.items()), None) if isinstance(left, dict) else next(iter(left ^ right), None)}")
        totals = [sum(row[index] for row in reference[0].values()) for index in range(1, 8)]
        print(f"note sites corpus matched files={len(reference[0])} rejected={len(reference[1])} encrypted={len(reference[2])} totals={totals}")
    else:
        raise SystemExit("usage: hwpx-note-sites-diff.py [--self-test]")
