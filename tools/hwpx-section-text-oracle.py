"""Independent, read-only ZIP/ElementTree census of selected HWPX text.

The oracle follows OPF spine IDs and XML expanded names, without calling the
Zig parser. It compares counts and UTF-8 content sizes, not XML event chunks or
visual rendering. Local reference/rhwp samples are intentionally not vendored.
"""

import json
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


ROOTS = (
    Path("legacy/rust/crates/hwp-core/tests/fixtures"),
    Path("reference/rhwp/samples"),
)
OPF = "{http://www.idpf.org/2007/opf/}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"
PARAGRAPH = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
INLINE = {
    "tab": "tab",
    "fwSpace": "fw_space",
    "nbSpace": "nb_space",
    "lineBreak": "line_break",
    "titleMark": "title_mark",
    "markpenBegin": "markpen_begin",
    "markpenEnd": "markpen_end",
    "hypen": "hypen",
}
OTHER_CONTENT = {
    "script": "script",
    "stringParam": "string_param",
    "shapeComment": "shape_comment",
    "integerParam": "integer_param",
    "booleanParam": "boolean_param",
    "metaTag": "meta_tag",
    "firstKey": "first_key",
    "mainText": "main_text",
    "subText": "sub_text",
}
MAX_PACKAGE_BYTES = 25_000_000
MAX_SECTION_BYTES = 128 * 1024 * 1024
MAX_MANIFEST_BYTES = 2 * 1024 * 1024


def bounded_read(archive: ZipFile, name: str, limit: int) -> bytes:
    info = archive.getinfo(name)
    if info.file_size > limit:
        raise ValueError("HWPX oracle entry limit exceeded")
    with archive.open(info) as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError("HWPX oracle entry limit exceeded")
    return data


def inspect_text(node: ET.Element, parent: str, result: dict, inside_text: bool = False) -> None:
    now_inside_text = inside_text or node.tag == PARAGRAPH + "t"

    def note_other(owner: str, value) -> None:
        if value is None or not value.strip():
            return
        if owner.startswith(PARAGRAPH):
            kind = OTHER_CONTENT.get(owner[len(PARAGRAPH) :], "unknown")
        else:
            kind = "unknown"
        result["non_text_content_chunks"] += 1
        result["other_content"][kind] += 1

    if not now_inside_text:
        note_other(node.tag, node.text)
    if node.tag == PARAGRAPH + "p":
        result["paragraphs"] += 1
        result["paragraphs_without_direct_run"] += not any(
            child.tag == PARAGRAPH + "run" for child in node
        )
    if node.tag == PARAGRAPH + "run":
        result["runs"] += 1
        result["non_direct_runs"] += parent != PARAGRAPH + "p"
    if node.tag == PARAGRAPH + "t":
        result["text_elements"] += 1
        result["non_direct_text_elements"] += parent != PARAGRAPH + "run"
        size = len("".join(node.itertext()).encode("utf-8"))
        result["text_bytes"] += size
        result["empty_text_elements"] += size == 0

        def count_inline(container: ET.Element, depth: int) -> None:
            for child in container:
                if child.tag.startswith(PARAGRAPH):
                    kind = INLINE.get(child.tag[len(PARAGRAPH) :], "unknown")
                else:
                    kind = "unknown"
                result["inline"][kind] += 1
                result["nested_inline_elements"] += depth > 0
                count_inline(child, depth + 1)

        count_inline(node, 0)
    for child in node:
        inspect_text(child, node.tag, result, now_inside_text)
        if not now_inside_text:
            note_other(node.tag, child.tail)


def self_check() -> None:
    source = (
        '<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" '
        'xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph">'
        '<p:p><p:run><p:t>A&amp;B<p:lineBreak/>C</p:t><p:script>meta</p:script>'
        '</p:run></p:p></s:sec>'
    )
    result = {
        "paragraphs": 0, "paragraphs_without_direct_run": 0,
        "runs": 0, "non_direct_runs": 0,
        "text_elements": 0, "text_bytes": 0,
        "empty_text_elements": 0, "non_direct_text_elements": 0,
        "nested_inline_elements": 0, "inline": Counter(),
        "non_text_content_chunks": 0, "other_content": Counter(),
    }
    inspect_text(ET.fromstring(source), "", result)
    assert result["paragraphs"] == result["runs"] == result["text_elements"] == 1
    assert result["paragraphs_without_direct_run"] == result["non_direct_runs"] == 0
    assert result["text_bytes"] == 4
    assert result["inline"] == Counter({"line_break": 1})
    assert result["other_content"] == Counter({"script": 1})
    layout_only = ET.fromstring(
        '<p:p xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph">'
        '<p:linesegarray/></p:p>'
    )
    inspect_text(layout_only, "", result)
    assert result["paragraphs_without_direct_run"] == 1


def main() -> None:
    self_check()
    tree_shards = [
        {"accepted": 0, "rejected_zip": 0, "encrypted": 0, "sections": 0, "elements": 0}
        for _ in range(8)
    ]
    result = {
        "accepted": 0,
        "rejected_zip": 0,
        "encrypted": 0,
        "sections": 0,
        "section_elements": 0,
        "max_section_elements": 0,
        "max_section_bytes": 0,
        "direct_paragraphs": 0,
        "sections_without_direct_paragraph": 0,
        "paragraphs": 0,
        "paragraphs_without_direct_run": 0,
        "runs": 0,
        "non_direct_runs": 0,
        "text_elements": 0,
        "empty_text_elements": 0,
        "text_bytes": 0,
        "non_direct_text_elements": 0,
        "nested_inline_elements": 0,
        "inline": Counter(),
        "non_text_content_chunks": 0,
        "other_content": Counter(),
    }
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = tree_shards[(sum(path.relative_to(root).as_posix().encode("utf-8")) + root_index) % len(tree_shards)]
            if path.stat().st_size > MAX_PACKAGE_BYTES:
                raise ValueError("HWPX oracle package limit exceeded")
            try:
                with ZipFile(path) as archive:
                    if "META-INF/manifest.xml" in archive.namelist():
                        security = bounded_read(archive, "META-INF/manifest.xml", MAX_MANIFEST_BYTES)
                        if b"encryption-data" in security:
                            result["encrypted"] += 1
                            shard["encrypted"] += 1
                            continue
                    opf = ET.fromstring(bounded_read(archive, "Contents/content.hpf", MAX_MANIFEST_BYTES))
                    items = {
                        item.get("id"): item.get("href")
                        for item in opf.findall(OPF + "manifest/" + OPF + "item")
                    }
                    spine = opf.find(OPF + "spine")
                    if spine is None:
                        raise ValueError("HWPX oracle missing spine")
                    for entry in spine.findall(OPF + "itemref"):
                        name = items[entry.get("idref")]
                        if not name.endswith(".xml"):
                            continue
                        section_bytes = bounded_read(archive, name, MAX_SECTION_BYTES)
                        section = ET.fromstring(section_bytes)
                        if section.tag != SECTION:
                            continue
                        result["sections"] += 1
                        shard["sections"] += 1
                        section_elements = sum(1 for _ in section.iter())
                        result["section_elements"] += section_elements
                        shard["elements"] += section_elements
                        result["max_section_elements"] = max(result["max_section_elements"], section_elements)
                        result["max_section_bytes"] = max(result["max_section_bytes"], len(section_bytes))
                        direct = sum(child.tag == PARAGRAPH + "p" for child in section)
                        result["direct_paragraphs"] += direct
                        result["sections_without_direct_paragraph"] += direct == 0
                        inspect_text(section, "", result)
                    result["accepted"] += 1
                    shard["accepted"] += 1
            except BadZipFile:
                result["rejected_zip"] += 1
                shard["rejected_zip"] += 1
    result["section_tree_shards"] = tree_shards
    result["inline"] = dict(sorted(result["inline"].items()))
    result["other_content"] = dict(sorted(result["other_content"].items()))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
