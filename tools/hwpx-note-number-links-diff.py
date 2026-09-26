#!/usr/bin/env python3
"""Independent ZIP/ElementTree check of note-embedded autoNum ancestry."""

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
CONTROLS = {PARA + "autoNum", PARA + "newNum", PARA + "pageNum"}


def require(ok, detail):
    if not ok:
        raise AssertionError(detail)


def count(h, n):
    h.update(n.to_bytes(8, "little"))


def number(h, n):
    if n is None:
        h.update(b"\0")
    else:
        h.update(b"\1")
        h.update(int(n).to_bytes(4, "little", signed=True))


def sections_from_zip(archive):
    opf = ET.fromstring(archive.read("Contents/content.hpf"))
    manifest = {item.get("id"): item for item in opf.findall(OPF + "manifest/" + OPF + "item")}
    sections = []
    for ref in opf.findall(OPF + "spine/" + OPF + "itemref"):
        item = manifest[ref.get("idref")]
        if item.get("media-type") != "application/xml":
            continue
        data = archive.read(item.get("href"))
        root = ET.fromstring(data)
        if root.tag == SECTION:
            sections.append(root)
    return sections


def digest_sections(sections):
    notes = []
    controls = []
    links = []
    outside = 0
    for ordinal, root in enumerate(sections):
        elements = list(root.iter())
        index = {item: i for i, item in enumerate(elements)}
        parents = {child: parent for parent in elements for child in parent}
        note_map = {}
        for element in elements:
            if element.tag in KINDS and element in parents:
                note_map[element] = len(notes)
                notes.append((KINDS[element.tag], ordinal, index[element], [0, 0, 0, 0, 0]))
        for element in elements:
            if element.tag not in CONTROLS or element not in parents:
                continue
            control_index = len(controls)
            controls.append(element)
            if element.tag != PARA + "autoNum":
                continue
            ancestor = parents[element]
            list_parent = None
            note_index = None
            while ancestor is not None:
                if ancestor.tag == PARA + "subList":
                    list_parent = parents.get(ancestor)
                if ancestor in note_map:
                    note_index = note_map[ancestor]
                    break
                ancestor = parents.get(ancestor)
            if note_index is None:
                outside += 1
                continue
            kind, _, _, summary = notes[note_index]
            raw_type = element.get("numType")
            matching = None if raw_type is None else raw_type == ("FOOTNOTE" if kind == 0 else "ENDNOTE")
            inside = list_parent is ancestor
            summary[0] += 1
            summary[1] += inside
            summary[2] += matching is True
            summary[3] += matching is False
            summary[4] += matching is None
            links.append((note_index, control_index, ordinal, index[element], inside, matching, element.get("num")))
    without = sum(summary[0] == 0 for _, _, _, summary in notes)
    h = hashlib.sha256()
    for item in (len(sections), len(notes), len(controls), len(links), outside, without):
        count(h, item)
    for kind, ordinal, element_index, summary in notes:
        for item in (kind, ordinal, element_index, *summary):
            count(h, item)
    for note_index, control_index, ordinal, element_index, inside, matching, num in links:
        for item in (note_index, control_index, ordinal, element_index, inside):
            count(h, item)
        h.update(bytes((0 if matching is None else 2 if matching else 1,)))
        number(h, num)
    return h.hexdigest(), len(links), outside, without


def expected():
    files, rejected, encrypted = {}, set(), set()
    for root_index, root in enumerate(SOURCES):
        for path in root.rglob("*.hwpx"):
            key = root_index, hashlib.sha256(path.relative_to(root).as_posix().encode()).hexdigest()
            try:
                with zipfile.ZipFile(path) as archive:
                    if "META-INF/manifest.xml" in archive.namelist() and b"encryption-data" in archive.read("META-INF/manifest.xml"):
                        encrypted.add(key)
                        continue
                    files[key] = digest_sections(sections_from_zip(archive))
            except zipfile.BadZipFile:
                rejected.add(key)
    return files, rejected, encrypted


def product():
    run = subprocess.run(["zig", "test", "src/hwpx_note_number_links_survey.zig", "-O", "ReleaseFast", "--test-filter", "HWPX note number links corpus per-file independent XML digest"], cwd=ROOT, capture_output=True, text=True)
    require(run.returncode == 0, run.stderr[-4000:])
    files, rejected, encrypted = {}, set(), set()
    for line in run.stderr.splitlines():
        if "NOTE_LINK_FILE " in line:
            _, root, path, digest, links, outside, without = line[line.index("NOTE_LINK_FILE "):].split()
            key = int(root), path
            require(key not in files, key)
            files[key] = digest, int(links), int(outside), int(without)
        elif "NOTE_LINK_REJECTED " in line:
            _, root, path = line[line.index("NOTE_LINK_REJECTED "):].split()
            rejected.add((int(root), path))
        elif "NOTE_LINK_ENCRYPTED " in line:
            _, root, path = line[line.index("NOTE_LINK_ENCRYPTED "):].split()
            encrypted.add((int(root), path))
        elif "NOTE_LINK_TOTAL " in line:
            print(line[line.index("NOTE_LINK_TOTAL "):])
    return files, rejected, encrypted


def self_test():
    xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:footNote><p:subList><p:p><p:autoNum num='1' numType='FOOTNOTE'/></p:p></p:subList></p:footNote></p:run></p:p></s:sec>"
    baseline = digest_sections([ET.fromstring(xml)])
    variants = (
        xml.replace("FOOTNOTE'", "ENDNOTE'"),
        xml.replace("num='1'", "num='2'"),
        xml.replace("<p:subList>", "<p:wrapper><p:subList>").replace("</p:subList>", "</p:subList></p:wrapper>"),
        xml.replace("<p:autoNum", "<p:newNum"),
        xml.replace("<p:footNote>", "<p:endNote>").replace("</p:footNote>", "</p:endNote>"),
        xml.replace(" num='1'", ""),
        xml.replace(" numType='FOOTNOTE'", ""),
        xml.replace("p:footNote", "s:footNote"),
        xml.replace("</p:footNote>", "</p:footNote><p:autoNum num='3' numType='PAGE'/>"),
        xml.replace("<p:autoNum num='1' numType='FOOTNOTE'/>", "<p:autoNum num='1' numType='FOOTNOTE'/><p:autoNum num='1' numType='FOOTNOTE'/>")
    )
    for variant in variants:
        require(digest_sections([ET.fromstring(variant)]) != baseline, variant)
    print(f"note link oracle detected {len(variants)} mutations")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        reference = expected()
        observed = product()
        for left, right, name in zip(reference, observed, ("accepted", "rejected", "encrypted")):
            require(left == right, f"{name} mismatch: expected {len(left)} observed {len(right)}; first={next(iter(left.items() ^ right.items()), None) if isinstance(left, dict) else next(iter(left ^ right), None)}")
        print(f"note link corpus matched files={len(reference[0])} rejected={len(reference[1])} encrypted={len(reference[2])}")
