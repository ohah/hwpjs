#!/usr/bin/env python3
"""Independent ZIP/ElementTree oracle for text owned by HWPX notes."""

import hashlib
import pathlib
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = (ROOT / "legacy/rust/crates/hwp-core/tests/fixtures", ROOT / "reference/rhwp/samples")
OPF = "{http://www.idpf.org/2007/opf/}"
PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
KINDS = {PARA + "footNote": 0, PARA + "endNote": 1}


def require(condition, detail):
    if not condition:
        raise AssertionError(detail)


def count(h, n):
    h.update(n.to_bytes(8, "little"))


def optional_index(h, n):
    if n is None:
        h.update(b"\0")
    else:
        h.update(b"\1")
        count(h, n)


def selected_sections(archive):
    opf = ET.fromstring(archive.read("Contents/content.hpf"))
    items = {item.get("id"): item for item in opf.findall(OPF + "manifest/" + OPF + "item")}
    sections = []
    for ref in opf.findall(OPF + "spine/" + OPF + "itemref"):
        item = items[ref.get("idref")]
        if item.get("media-type") != "application/xml":
            continue
        root = ET.fromstring(archive.read(item.get("href")))
        if root.tag == SECTION:
            sections.append(root)
    return sections


def digest_sections(sections):
    notes = []
    for ordinal, root in enumerate(sections):
        elements = list(root.iter())
        indices = {element: index for index, element in enumerate(elements)}
        parents = {child: parent for parent in elements for child in parent}
        note_map = {}
        for element in elements:
            if element.tag in KINDS and element in parents:
                note_map[element] = len(notes)
                notes.append((KINDS[element.tag], ordinal, indices[element], []))

        def add_text(text, current_text):
            if text is not None and current_text is not None:
                raw = text.encode("utf-8")
                current_text[2].update(raw)
                current_text[3] += len(raw)

        def walk(element, owner=None, current_text=None, paragraph=None):
            if element in note_map:
                owner = note_map[element]
                current_text = None
                paragraph = None
            elif owner is not None:
                if element.tag == PARA + "p":
                    paragraph = indices[element]
                if element.tag == PARA + "t":
                    current_text = [indices[element], paragraph, hashlib.sha256(), 0]
                    notes[owner][3].append(current_text)
            add_text(element.text, current_text)
            for child in element:
                walk(child, owner, current_text, paragraph)
                add_text(child.tail, current_text)

        walk(root)

    total_text = sum(len(items) for _, _, _, items in notes)
    total_bytes = sum(item[3] for _, _, _, items in notes for item in items)
    without = sum(not items for _, _, _, items in notes)
    h = hashlib.sha256()
    for item in (len(sections), len(notes), total_text, total_bytes, without):
        count(h, item)
    for kind, ordinal, element_index, items in notes:
        for item in (kind, ordinal, element_index, len(items), sum(record[3] for record in items)):
            count(h, item)
        for text_index, paragraph_index, text_hash, text_bytes in items:
            count(h, text_index)
            optional_index(h, paragraph_index)
            count(h, text_bytes)
            h.update(text_hash.digest())
    return h.hexdigest(), len(notes), total_text, total_bytes, without


def expected():
    files, rejected, encrypted = {}, set(), set()
    for root_index, root in enumerate(SOURCES):
        for path in root.rglob("*.hwpx"):
            require(path.stat().st_size <= 25_000_000, path)
            key = root_index, hashlib.sha256(path.relative_to(root).as_posix().encode()).hexdigest()
            try:
                with zipfile.ZipFile(path) as archive:
                    if "META-INF/manifest.xml" in archive.namelist() and b"encryption-data" in archive.read("META-INF/manifest.xml"):
                        encrypted.add(key)
                        continue
                    files[key] = digest_sections(selected_sections(archive))
            except zipfile.BadZipFile:
                rejected.add(key)
    return files, rejected, encrypted


def product():
    run = subprocess.run(["zig", "test", "src/hwpx_note_text_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX note text corpus per-file independent XML digest"], cwd=ROOT, capture_output=True, text=True)
    require(run.returncode == 0, run.stderr[-4000:])
    files, rejected, encrypted = {}, set(), set()
    for line in run.stderr.splitlines():
        if "NOTE_TEXT_FILE " in line:
            _, root, path, digest, notes, texts, size, without = line[line.index("NOTE_TEXT_FILE "):].split()
            key = int(root), path
            require(key not in files, key)
            files[key] = digest, int(notes), int(texts), int(size), int(without)
        elif "NOTE_TEXT_REJECTED " in line:
            _, root, path = line[line.index("NOTE_TEXT_REJECTED "):].split()
            rejected.add((int(root), path))
        elif "NOTE_TEXT_ENCRYPTED " in line:
            _, root, path = line[line.index("NOTE_TEXT_ENCRYPTED "):].split()
            encrypted.add((int(root), path))
        elif "NOTE_TEXT_TOTAL " in line:
            print(line[line.index("NOTE_TEXT_TOTAL "):])
    return files, rejected, encrypted


def self_test():
    start = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'>"
    xml = start + "<p:p><p:footNote><p:subList><p:p><p:run><p:t>A&amp;B</p:t></p:run></p:p></p:subList></p:footNote></p:p></s:sec>"
    baseline = digest_sections([ET.fromstring(xml)])
    variants = (
        xml.replace("A&amp;B", "C&amp;B"),
        xml.replace("<p:t>A&amp;B</p:t>", ""),
        xml.replace("</p:run>", "<p:t/></p:run>"),
        xml.replace("p:footNote", "p:endNote"),
        xml.replace("p:footNote", "x:footNote"),
        xml.replace("p:t>", "x:t>"),
        xml.replace("<p:run>", "<p:wrapper><p:run>").replace("</p:run>", "</p:run></p:wrapper>"),
        xml.replace("<p:t>A&amp;B</p:t>", "<p:endNote><p:t>A&amp;B</p:t></p:endNote>")
    )
    for variant in variants:
        require(digest_sections([ET.fromstring(variant)]) != baseline, variant)
    require(digest_sections([ET.fromstring(xml.replace("A&amp;B", "<![CDATA[A&]]>B"))]) == baseline, "CDATA equivalence")
    print(f"note text oracle detected {len(variants)} mutations and one equivalent spelling")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        reference = expected()
        observed = product()
        for left, right, name in zip(reference, observed, ("accepted", "rejected", "encrypted")):
            require(left == right, f"{name} mismatch: expected {len(left)} observed {len(right)}; first={next(iter(left.items() ^ right.items()), None) if isinstance(left, dict) else next(iter(left ^ right), None)}")
        print(f"note text corpus matched files={len(reference[0])} rejected={len(reference[1])} encrypted={len(reference[2])}")
