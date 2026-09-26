#!/usr/bin/env python3
"""Independent ZIP/ElementTree oracle for selected HWPX foot/end note bodies."""

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
NOTES = {PARA + "footNote": 0, PARA + "endNote": 1}
SUB_LIST = PARA + "subList"
PARAGRAPH = PARA + "p"
NOTE_ATTRS = ("id", "flag", "number", "userChar", "prefixChar", "suffixChar", "instId")
LIST_ATTRS = ("id", "textDirection", "lineWrap", "vertAlign", "linkListIDRef",
              "linkListNextIDRef", "textWidth", "textHeight", "hasTextRef", "hasNumRef", "metatag")
ENUMS = {
    "textDirection": {"HORIZONTAL", "VERTICAL", "VERTICALALL"},
    "lineWrap": {"BREAK", "SQUEEZE", "KEEP"},
    "vertAlign": {"TOP", "CENTER", "BOTTOM"},
}


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
        for note in section.iter():
            if note.tag not in NOTES:
                continue
            parent = parents.get(note)
            if parent is not None:
                rows.append((ordinal, indices[parent], indices[note], split_name(parent.tag), note, indices))
    lists_total = sum(sum(child.tag == SUB_LIST for child in item) for *_, item, _ in rows)
    paragraphs_total = sum(sum(sum(p.tag == PARAGRAPH for p in child) for child in item if child.tag == SUB_LIST) for *_, item, _ in rows)
    digest = hashlib.sha256()
    number(digest, len(sections))
    number(digest, len(rows))
    number(digest, lists_total)
    number(digest, paragraphs_total)
    counts = [0, 0, lists_total, paragraphs_total, 0, 0, 0]
    for ordinal, parent_index, element_index, parent_name, item, indices in rows:
        kind = NOTES[item.tag]
        counts[kind] += 1
        lists = [child for child in item if child.tag == SUB_LIST]
        counts[4] += not lists
        counts[5] += len(lists) > 1
        number(digest, ordinal)
        number(digest, parent_index)
        number(digest, element_index)
        number(digest, kind)
        value(digest, parent_name[0].encode())
        value(digest, parent_name[1].encode())
        for attr in NOTE_ATTRS:
            optional(digest, item.get(attr))
        note_extra = len(item.attrib.keys() - set(NOTE_ATTRS))
        counts[6] += note_extra
        number(digest, note_extra)
        number(digest, len(item))
        number(digest, len(item) - len(lists))
        number(digest, len(lists))
        for sub_list in lists:
            number(digest, indices[sub_list])
            for attr in LIST_ATTRS:
                optional(digest, sub_list.get(attr))
            number(digest, sum(sub_list.get(attr) is not None and sub_list.get(attr) not in values for attr, values in ENUMS.items()))
            list_extra = len(sub_list.attrib.keys() - set(LIST_ATTRS))
            counts[6] += list_extra
            number(digest, list_extra)
            paragraphs = [child for child in sub_list if child.tag == PARAGRAPH]
            number(digest, len(paragraphs))
            number(digest, len(sub_list) - len(paragraphs))
            for paragraph in paragraphs:
                number(digest, indices[paragraph])
    return digest.hexdigest(), *counts


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
        ["zig", "test", "src/hwpx_note_bodies_survey.zig", "-O", "ReleaseFast",
         "--test-filter", "HWPX note bodies corpus per-file independent XML digest"],
        cwd=ROOT, capture_output=True, text=True,
    )
    require(result.returncode == 0, result.stderr[-4000:])
    accepted, rejected, encrypted = {}, set(), set()
    totals = None
    for line in result.stderr.splitlines():
        if "NOTE_CORPUS_FILE " in line:
            _, root, path_hash, digest, *counts = line[line.index("NOTE_CORPUS_FILE "):].split()
            require(len(counts) == 7, line)
            key = int(root), path_hash
            require(key not in accepted, key)
            accepted[key] = digest, *(int(count) for count in counts)
        elif "NOTE_CORPUS_REJECTED " in line:
            _, root, path_hash = line[line.index("NOTE_CORPUS_REJECTED "):].split()
            rejected.add((int(root), path_hash))
        elif "NOTE_CORPUS_ENCRYPTED " in line:
            _, root, path_hash = line[line.index("NOTE_CORPUS_ENCRYPTED "):].split()
            encrypted.add((int(root), path_hash))
        elif line.startswith("NOTE_CORPUS_TOTAL "):
            totals = tuple(int(v) for v in line.split()[1:])
    return accepted, rejected, encrypted, totals


def self_test():
    prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>"
    suffix = "</p:run></p:p></s:sec>"
    source = "<p:ctrl><p:footNote number='1' flag='385' instId='2'><p:subList textDirection='HORIZONTAL' textWidth='4'><p:p id='1'/><p:p id='2'/></p:subList></p:footNote><p:endNote suffixChar='41'><p:subList><p:p/></p:subList></p:endNote></p:ctrl>"
    baseline = inspect_sections([(prefix + source + suffix).encode()])
    require(baseline[1:] == (1, 1, 2, 3, 0, 0, 0), baseline)
    for changed in (
        source.replace("number='1'", "number='2'"),
        source.replace("flag='385'", "flag='386'"),
        source.replace("instId='2'", "instId='3'"),
        source.replace("textDirection='HORIZONTAL'", "textDirection='VERTICAL'"),
        source.replace("textWidth='4'", "textWidth='5'"),
        source.replace("<p:p id='1'/>", "<x:future/><p:p id='1'/>"),
        source.replace("<p:p id='2'", "<x:p id='2'"),
        source.replace("</p:footNote>", "<p:future/></p:footNote>"),
        source.replace("<p:subList>", "<x:subList>").replace("</p:subList></p:endNote>", "</x:subList></p:endNote>"),
        source.replace("<p:endNote ", "<x:endNote ").replace("</p:endNote>", "</x:endNote>"),
    ):
        require(baseline[0] != inspect_sections([(prefix + changed + suffix).encode()])[0], "mutation escaped digest")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("note bodies oracle self-test passed")
    elif not sys.argv[1:]:
        expected, rejected, encrypted = expected_all()
        actual, actual_rejected, actual_encrypted, totals = product()
        require(set(actual) == set(expected), ("accepted set", set(actual) ^ set(expected)))
        require(actual_rejected == rejected, ("rejected set", actual_rejected ^ rejected))
        require(actual_encrypted == encrypted, ("encrypted set", actual_encrypted ^ encrypted))
        require(totals == (len(expected), len(rejected), len(encrypted)), totals)
        for key, row in expected.items():
            require(actual[key] == row, ("mismatch", key, actual[key], row))
        print(f"note bodies corpus matched files={len(expected)} rejected={len(rejected)} encrypted={len(encrypted)} foot={sum(row[1] for row in expected.values())} end={sum(row[2] for row in expected.values())} sublists={sum(row[3] for row in expected.values())} paragraphs={sum(row[4] for row in expected.values())} missing={sum(row[5] for row in expected.values())} duplicate={sum(row[6] for row in expected.values())} other_attrs={sum(row[7] for row in expected.values())}")
    else:
        raise SystemExit("usage: hwpx-note-bodies-diff.py [--self-test]")
