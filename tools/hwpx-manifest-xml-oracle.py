"""Independent read-only OPF application/xml census for the local HWPX corpus.

This uses Python zipfile/ElementTree, not the Zig ZIP or XML implementations.
It checks syntax and counts; it does not validate HWPX XML schemas or meaning.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


ROOTS = (
    Path("legacy/rust/crates/hwp-core/tests/fixtures"),
    Path("reference/rhwp/samples"),
)
OPF = "{http://www.idpf.org/2007/opf/}"
ENCRYPTION = "{urn:oasis:names:tc:opendocument:xmlns:manifest:1.0}encryption-data"
APP = "{http://www.hancom.co.kr/hwpml/2011/app}"
CONFIG = "{urn:oasis:names:tc:opendocument:xmlns:config:1.0}"
PARA = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
HEAD = "{http://www.hancom.co.kr/hwpml/2011/head}"
MASTER_STYLE_FIELDS = (("paraPrIDRef", "paraProperties", "paraPr"),
                       ("styleIDRef", "styles", "style"),
                       ("charPrIDRef", "charProperties", "charPr"))
MASTER_KINDS = ("BOTH", "EVEN", "ODD", "LAST_PAGE", "OPTIONAL_PAGE")
SUB_LIST_FIELDS = ("id", "textDirection", "lineWrap", "vertAlign", "linkListIDRef",
                   "linkListNextIDRef", "textWidth", "textHeight", "hasTextRef", "hasNumRef", "metatag")
SUB_LIST_ENUMS = {"textDirection": ("HORIZONTAL", "VERTICAL", "VERTICALALL"),
                  "lineWrap": ("BREAK", "SQUEEZE", "KEEP"),
                  "vertAlign": ("TOP", "CENTER", "BOTTOM")}
LINE_SEG_FIELDS = ("textpos", "vertpos", "vertsize", "textheight", "baseline", "spacing", "horzpos", "horzsize", "flags")
LINE_SEG_UNSIGNED = frozenset(("textpos", "flags"))
RUN_MODEL_CHILDREN = frozenset((
    "secPr", "ctrl", "t", "tbl", "pic", "ole", "container", "equation",
    "line", "rect", "ellipse", "arc", "polygon", "curve", "connectLine",
    "textart", "compose", "dutmal", "btn", "radioBtn", "checkBtn",
    "comboBox", "listBox", "edit", "scrollBar", "video", "markpenBegin",
    "markpenEnd", "chart", "unknownObj",
))
TEXT_MODEL_CHILDREN = frozenset((
    "markpenBegin", "markpenEnd", "titleMark", "tab", "lineBreak",
    "hypen", "nbSpace", "fwSpace", "chval", "insertBegin",
    "insertEnd", "deleteBegin", "deleteEnd", "unknownch",
))
TRACK_CHANGE_TAGS = ("insertBegin", "insertEnd", "deleteBegin", "deleteEnd")
TAB_TYPES = frozenset(("LEFT", "RIGHT", "CENTER", "DECIMAL"))
TAB_LEADERS = frozenset(("NONE", "SOLID", "DOT", "DASH", "DASH_DOT", "DASH_DOT_DOT",
                         "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM"))
TAB_LEADERS_EXTENDED = frozenset(("WAVE", "DOUBLEWAVE", "THICK3D", "THICKREV3D", "3D", "REV3D"))
MAX_PACKAGE_BYTES = 25_000_000
MAX_ENTRY_BYTES = 128 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024


def empty():
    return dict(accepted=0, rejected_zip=0, encrypted=0, xml_items=0,
                external=0, duplicates=0, entries=0, bytes=0, elements=0,
                settings=0, masterpages=0, carets=0, caret_pos_sum=0,
                config_sets=0, config_items=0, short_sum=0,
                boolean_true=0, unsupported_types=0,
                master_sub_lists=0, master_sub_list_direct_paragraphs=0,
                master_sub_list_attribute_presence=[0] * len(SUB_LIST_FIELDS),
                master_sub_list_unknown_enums=0, master_sub_list_other_attributes=0,
                master_sub_list_width_sum=0, master_sub_list_height_sum=0,
                master_paragraphs=0, master_paragraph_missing_id=0,
                master_line_segments=Counter(),
                master_paragraph_zero_id=0, master_paragraph_missing_tc_id=0,
                master_paragraph_page_break_present=0, master_paragraph_page_break_true=0,
                master_paragraph_column_break_present=0, master_paragraph_column_break_true=0,
                master_paragraph_merged_present=0, master_paragraph_merged_true=0,
                master_style_paragraphs=0, master_style_non_direct_paragraphs=0,
                master_style_runs=0, master_style_non_direct_runs=0,
                master_style_ref_present=[0, 0, 0], master_style_ref_absent=[0, 0, 0],
                master_style_ref_resolved=[0, 0, 0], master_style_ref_missing=[0, 0, 0],
                master_style_ref_absent_table=[0, 0, 0],
                section_run_metadata=[0] * 7, master_run_metadata=[0] * 7,
                section_run_non_direct=0, master_run_non_direct=0,
                section_run_secpr_duplicate=0, master_run_secpr_duplicate=0,
                section_run_secpr_non_first=0, master_run_secpr_non_first=0,
                section_run_children={}, master_run_children={},
                section_run_child_classes=[0] * 5, master_run_child_classes=[0] * 5,
                section_switch_shape=[0] * 21, master_switch_shape=[0] * 21,
                section_text_nodes=[0] * 6, master_text_nodes=[0] * 6,
                section_text_children={}, master_text_children={},
                section_text_child_classes=[0] * 4, master_text_child_classes=[0] * 4,
                section_tab_fields=[0] * 21, master_tab_fields=[0] * 21,
                section_markpen_fields=[0] * 9, master_markpen_fields=[0] * 9,
                section_title_mark_fields=[0] * 6, master_title_mark_fields=[0] * 6,
                section_track_change_tag_fields=[0] * 20, master_track_change_tag_fields=[0] * 20,
                master_page_number_sum=0,
                master_type_counts=[0] * len(MASTER_KINDS),
                master_manifest_id_mismatch=0, master_refs=0,
                master_resolved=0, master_missing=0, master_absent=0,
                master_ambiguous=0, master_count_declarations=0)


def master_path(name):
    prefix = "Contents/masterpage"
    return (name.startswith(prefix) and name.endswith(".xml")
            and bool(name[len(prefix):-4])
            and all("0" <= char <= "9" for char in name[len(prefix):-4]))


def count_master_line_segments(sub_list, counts):
    """Independent direct p/linesegarray/lineseg census under one root subList."""
    for paragraph in sub_list.iter(PARA + "p"):
        counts["paragraphs"] += 1
        arrays = [child for child in paragraph if child.tag == PARA + "linesegarray"]
        counts["arrays"] += len(arrays)
        counts["paragraphs_without_array"] += not arrays
        counts["paragraphs_with_multiple_arrays"] += len(arrays) > 1
        for array in arrays:
            counts["array_other_attributes"] += len(array.attrib)
            segments = [child for child in array if child.tag == PARA + "lineseg"]
            counts["segments"] += len(segments)
            counts["empty_arrays"] += not segments
            counts["array_other_direct"] += len(array) - len(segments)
            counts["array_foreign_direct"] += sum(not child.tag.startswith(PARA) for child in array if child.tag != PARA + "lineseg")
            for segment in segments:
                counts["segment_other_attributes"] += sum(name not in LINE_SEG_FIELDS for name in segment.attrib)
                counts["segment_direct_children"] += len(segment)
                counts["segment_foreign_direct"] += sum(not child.tag.startswith(PARA) for child in segment)
                for field in LINE_SEG_FIELDS:
                    raw = segment.get(field)
                    if raw is None:
                        counts[field + "_missing"] += 1
                        continue
                    normalized = raw.strip()
                    if not re.fullmatch(r"[+-]?[0-9]+", normalized):
                        raise ValueError("master-page line segment damaged number")
                    number = int(normalized)
                    if number < (0 if field in LINE_SEG_UNSIGNED else -0x80000000) or number > 0xFFFFFFFF:
                        raise ValueError("master-page line segment number out of range")
                    counts[field + "_present"] += 1
                    counts[field + "_sum"] += number
                    counts[field + "_zero"] += number == 0
                    counts[field + "_negative"] += number < 0
                    counts[field + "_highbit"] += number >= 0x80000000


def self_test_master_line_segments():
    sub = ET.fromstring(
        '<p:subList xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:x="urn:foreign">'
        '<p:p><x:linesegarray/><p:linesegarray x:extra="1"><x:lineseg/><p:lineseg '
        'textpos="4294967295" spacing="-1" flags="0" x:extra="2"><x:child/></p:lineseg>'
        '</p:linesegarray></p:p><p:p><p:linesegarray/></p:p></p:subList>'
    )
    counts = Counter()
    count_master_line_segments(sub, counts)
    expected = Counter({"paragraphs": 2, "arrays": 2, "segments": 1, "empty_arrays": 1,
                        "array_other_attributes": 1, "array_other_direct": 1,
                        "array_foreign_direct": 1, "segment_other_attributes": 1,
                        "segment_direct_children": 1, "segment_foreign_direct": 1,
                        "textpos_present": 1, "textpos_sum": 4294967295, "textpos_highbit": 1,
                        "spacing_present": 1, "spacing_sum": -1, "spacing_negative": 1,
                        "flags_present": 1, "flags_zero": 1,
                        **{name + "_missing": 1 for name in LINE_SEG_FIELDS if name not in ("textpos", "spacing", "flags")}})
    assert Counter({key: value for key, value in counts.items() if value != 0}) == expected, counts


def count_run_metadata(counts, node):
    char = node.get("charTcId")
    para = node.get("paraTcId")
    counts[0] += 1
    counts[1] += char is None
    counts[2] += char is not None and int(char) == 0
    counts[3] += para is not None
    counts[4] += char is None and para is not None
    counts[5] += char is not None and para is not None and int(char) == int(para)
    counts[6] += char is not None and para is not None and int(char) != int(para)


def count_run_structure(shard, prefix, run, parent):
    shard[prefix + "_run_non_direct"] += parent.tag != PARA + "p"
    children = list(run)
    positions = [index for index, child in enumerate(children) if child.tag == PARA + "secPr"]
    shard[prefix + "_run_secpr_duplicate"] += len(positions) > 1
    shard[prefix + "_run_secpr_non_first"] += bool(positions) and positions[0] != 0
    names = shard[prefix + "_run_children"]
    classes = shard[prefix + "_run_child_classes"]
    for child in children:
        names[child.tag] = names.get(child.tag, 0) + 1
        if child.tag.startswith(PARA):
            local = child.tag[len(PARA):]
            classes[0 if local in RUN_MODEL_CHILDREN else 1 if local == "bookmark" else 2 if local == "switch" else 3] += 1
        else:
            classes[4] += 1
        if child.tag == PARA + "switch":
            count_switch_shape(shard[prefix + "_switch_shape"], child)


def count_switch_shape(counts, node):
    # [switches, switch extras, cases, defaults, other switch children,
    #  required namespace present/empty/chart/other, unqualified/both,
    #  case/default extras, case chart/other, default ole/other,
    #  missing case/default, duplicate default, case after default].
    counts[0] += 1
    counts[1] += len(node.attrib)
    cases = defaults = 0
    after_default = False
    for branch in node:
        if branch.tag == PARA + "case":
            cases += 1
            counts[2] += 1
            after_default |= defaults > 0
            required = branch.get(PARA + "required-namespace")
            unqualified = branch.get("required-namespace")
            counts[5] += required is not None
            counts[6] += required == ""
            counts[7] += required == "http://www.hancom.co.kr/hwpml/2016/ooxmlchart"
            counts[8] += required is not None and required not in ("", "http://www.hancom.co.kr/hwpml/2016/ooxmlchart")
            counts[9] += unqualified is not None
            counts[10] += required is not None and unqualified is not None
            counts[11] += sum(key != PARA + "required-namespace" for key in branch.attrib)
            for child in branch:
                counts[13 if child.tag == PARA + "chart" else 14] += 1
        elif branch.tag == PARA + "default":
            defaults += 1
            counts[3] += 1
            counts[12] += len(branch.attrib)
            for child in branch:
                counts[15 if child.tag == PARA + "ole" else 16] += 1
        else:
            counts[4] += 1
    counts[17] += cases == 0
    counts[18] += defaults == 0
    counts[19] += defaults > 1
    counts[20] += after_default


def count_text_node(shard, prefix, node, parent):
    counts = shard[prefix + "_text_nodes"]
    counts[0] += 1
    counts[1] += parent.tag != PARA + "run"
    raw = node.get("charStyleIDRef")
    counts[2] += raw is None
    counts[3] += raw is not None and int(raw) == 0
    counts[4] += raw is not None and int(raw) > 0xFFFFFFFF
    counts[5] += sum(child.tag not in {PARA + name for name in TEXT_MODEL_CHILDREN} for child in node)
    names = shard[prefix + "_text_children"]
    classes = shard[prefix + "_text_child_classes"]
    for child in node:
        names[child.tag] = names.get(child.tag, 0) + 1
        if child.tag.startswith(PARA):
            local = child.tag[len(PARA):]
            classes[0 if local in TEXT_MODEL_CHILDREN else 1 if local == "hyphen" else 2] += 1
        else:
            classes[3] += 1
        if child.tag == PARA + "tab":
            count_tab(shard[prefix + "_tab_fields"], child)
        elif child.tag == PARA + "markpenBegin":
            count_markpen_begin(shard[prefix + "_markpen_fields"], child)
        elif child.tag == PARA + "markpenEnd":
            count_markpen_end(shard[prefix + "_markpen_fields"], child)
        elif child.tag == PARA + "titleMark":
            count_title_mark(shard[prefix + "_title_mark_fields"], child)
        elif child.tag in {PARA + name for name in TRACK_CHANGE_TAGS}:
            count_track_change_tag(shard[prefix + "_track_change_tag_fields"], child)


def count_markpen_begin(counts, node):
    # [begin, color present/valid/invalid/zero/RGB sum, begin extra, end, end extra]
    counts[0] += 1
    counts[6] += sum(key != "color" for key in node.attrib)
    color = node.get("color")
    if color is not None:
        counts[1] += 1
        if re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
            counts[2] += 1
            rgb = int(color[1:], 16)
            counts[4] += rgb == 0
            counts[5] += rgb
        else:
            counts[3] += 1


def count_markpen_end(counts, node):
    counts[7] += 1
    counts[8] += len(node.attrib)


def count_title_mark(counts, node):
    # [marks, ignore present/true/false/other, extra attributes]
    counts[0] += 1
    counts[5] += sum(key != "ignore" for key in node.attrib)
    raw = node.get("ignore")
    if raw is not None:
        counts[1] += 1
        value = raw.strip(" \t\r\n")
        if value in ("true", "1"):
            counts[2] += 1
        elif value in ("false", "0"):
            counts[3] += 1
        else:
            counts[4] += 1


def count_track_change_tag(counts, node):
    # [4 kinds, Id 5, TcId 5, paraend present/true/false/invalid,
    #  begin paraend present, extra attributes].
    kind = node.tag[len(PARA):]
    counts[TRACK_CHANGE_TAGS.index(kind)] += 1
    for name, base in (("Id", 4), ("TcId", 9)):
        raw = node.get(name)
        if raw is None:
            continue
        counts[base] += 1
        value = raw.strip(" \t\r\n")
        if not re.fullmatch(r"[+-]?[0-9]+", value) or int(value) < 0:
            counts[base + 3] += 1
        else:
            number = int(value)
            if number == 0:
                counts[base + 1] += 1
            elif number > 0xFFFFFFFF:
                counts[base + 2] += 1
            else:
                counts[base + 4] += number
    paraend = node.get("paraend")
    if paraend is not None:
        counts[14] += 1
        counts[18] += kind in ("insertBegin", "deleteBegin")
        value = paraend.strip(" \t\r\n")
        if value in ("true", "1"):
            counts[15] += 1
        elif value in ("false", "0"):
            counts[16] += 1
        else:
            counts[17] += 1
    counts[19] += sum(key not in ("Id", "TcId", "paraend") for key in node.attrib)


def tab_number(raw):
    if raw is None:
        return None
    trimmed = raw.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", trimmed):
        return None
    number = int(trimmed)
    return number if number >= 0 else None


def count_tab(counts, node):
    # [tabs, width present/zero/over-u32/sum, type present/numeric/named/other/
    #  over-u32/sum/gt4, leader present/numeric/base-named/extended-named/other/
    #  over-u32/sum/gt17, extra attributes]
    counts[0] += 1
    counts[20] += sum(key not in ("width", "type", "leader") for key in node.attrib)
    width = node.get("width")
    if width is not None:
        counts[1] += 1
        number = tab_number(width)
        if number is None:
            raise ValueError("invalid tab width")
        counts[2] += number == 0
        counts[3] += number > 0xFFFFFFFF
        if number <= 0xFFFFFFFF:
            counts[4] += number
    raw_type = node.get("type")
    if raw_type is not None:
        counts[5] += 1
        number = tab_number(raw_type)
        if number is not None:
            counts[6] += 1
            counts[9] += number > 0xFFFFFFFF
            if number <= 0xFFFFFFFF:
                counts[10] += number
                counts[11] += number > 4
        elif raw_type in TAB_TYPES:
            counts[7] += 1
        else:
            counts[8] += 1
    leader = node.get("leader")
    if leader is not None:
        counts[12] += 1
        number = tab_number(leader)
        if number is not None:
            counts[13] += 1
            counts[17] += number > 0xFFFFFFFF
            if number <= 0xFFFFFFFF:
                counts[18] += number
                counts[19] += number > 17
        elif leader in TAB_LEADERS:
            counts[14] += 1
        elif leader in TAB_LEADERS_EXTENDED:
            counts[15] += 1
        else:
            counts[16] += 1


def main():
    shards = [empty() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        if not root.is_dir():
            raise FileNotFoundError(root)
        for path in root.rglob("*.hwpx"):
            relative = path.relative_to(root).as_posix().encode("utf-8")
            shard = shards[(sum(relative) + root_index) % len(shards)]
            if path.stat().st_size > MAX_PACKAGE_BYTES:
                raise ValueError("oracle package limit exceeded")
            try:
                with ZipFile(path) as archive:
                    if "META-INF/manifest.xml" in archive.namelist():
                        security = ET.fromstring(archive.read("META-INF/manifest.xml"))
                        if any(node.tag == ENCRYPTION for node in security.iter()):
                            shard["encrypted"] += 1
                            continue
                    opf = ET.fromstring(archive.read("Contents/content.hpf"))
                    seen = set()
                    total = 0
                    master_ids = []
                    master_refs = []
                    header_tables = [None, None, None]
                    master_style_values = [[], [], []]
                    for item in opf.findall(OPF + "manifest/" + OPF + "item"):
                        if item.get("media-type") != "application/xml":
                            continue
                        shard["xml_items"] += 1
                        if item.get("isEmbeded") == "0":
                            shard["external"] += 1
                            continue
                        name = item.get("href")
                        if name in seen:
                            shard["duplicates"] += 1
                            continue
                        seen.add(name)
                        info = archive.getinfo(name)
                        if info.file_size > MAX_ENTRY_BYTES or info.file_size > MAX_TOTAL_BYTES - total:
                            raise ValueError("oracle XML byte limit exceeded")
                        data = archive.read(name)
                        document = ET.fromstring(data)
                        total += len(data)
                        shard["entries"] += 1
                        shard["bytes"] += len(data)
                        shard["elements"] += sum(1 for _ in document.iter())
                        shard["settings"] += name == "settings.xml"
                        if name == "Contents/header.xml":
                            ref_list = document.find(HEAD + "refList")
                            for index, (_, group, element) in enumerate(MASTER_STYLE_FIELDS):
                                table = None if ref_list is None else ref_list.find(HEAD + group)
                                if table is not None:
                                    header_tables[index] = {int(node.attrib["id"]) for node in table.findall(HEAD + element)}
                        if name == "settings.xml":
                            if document.tag != APP + "HWPApplicationSetting":
                                raise ValueError("unexpected settings root")
                            for child in document:
                                if child.tag == APP + "CaretPosition":
                                    shard["carets"] += 1
                                    if "pos" in child.attrib:
                                        shard["caret_pos_sum"] += int(child.attrib["pos"])
                                elif child.tag == CONFIG + "config-item-set":
                                    shard["config_sets"] += 1
                                    for config_item in child:
                                        if config_item.tag != CONFIG + "config-item":
                                            continue
                                        shard["config_items"] += 1
                                        type_name = config_item.get("type", config_item.get(CONFIG + "type"))
                                        value = "".join(config_item.itertext()).strip()
                                        if type_name == "short":
                                            shard["short_sum"] += int(value)
                                        elif type_name == "boolean":
                                            shard["boolean_true"] += value in ("true", "1")
                                        else:
                                            shard["unsupported_types"] += 1
                        shard["masterpages"] += name.startswith("Contents/masterpage")
                        if master_path(name):
                            if document.tag != "masterPage":
                                raise ValueError("unexpected master-page root")
                            page_id = document.get("id")
                            if not page_id:
                                raise ValueError("missing master-page ID")
                            master_ids.append(page_id)
                            shard["master_manifest_id_mismatch"] += page_id != item.get("id")
                            kind = document.get("type")
                            if kind in MASTER_KINDS:
                                shard["master_type_counts"][MASTER_KINDS.index(kind)] += 1
                            if document.get("pageNumber") is not None:
                                shard["master_page_number_sum"] += int(document.get("pageNumber"))
                            for child in document:
                                if child.tag != PARA + "subList":
                                    continue
                                shard["master_sub_lists"] += 1
                                count_master_line_segments(child, shard["master_line_segments"])
                                shard["master_sub_list_direct_paragraphs"] += sum(
                                    grandchild.tag == PARA + "p" for grandchild in child)
                                shard["master_sub_list_other_attributes"] += sum(
                                    field not in SUB_LIST_FIELDS for field in child.attrib)
                                for index, field in enumerate(SUB_LIST_FIELDS):
                                    if field not in child.attrib:
                                        continue
                                    shard["master_sub_list_attribute_presence"][index] += 1
                                    if field in SUB_LIST_ENUMS and child.attrib[field] not in SUB_LIST_ENUMS[field]:
                                        shard["master_sub_list_unknown_enums"] += 1
                                if "textWidth" in child.attrib:
                                    shard["master_sub_list_width_sum"] += int(child.attrib["textWidth"])
                                if "textHeight" in child.attrib:
                                    shard["master_sub_list_height_sum"] += int(child.attrib["textHeight"])
                                for paragraph in child.iter(PARA + "p"):
                                    shard["master_paragraphs"] += 1
                                    para_id = paragraph.get("id")
                                    shard["master_paragraph_missing_id"] += para_id is None
                                    shard["master_paragraph_zero_id"] += para_id is not None and int(para_id) == 0
                                    shard["master_paragraph_missing_tc_id"] += paragraph.get("paraTcId") is None
                                    shard["master_paragraph_page_break_present"] += "pageBreak" in paragraph.attrib
                                    shard["master_paragraph_page_break_true"] += paragraph.get("pageBreak") in ("true", "1")
                                    shard["master_paragraph_column_break_present"] += "columnBreak" in paragraph.attrib
                                    shard["master_paragraph_column_break_true"] += paragraph.get("columnBreak") in ("true", "1")
                                    shard["master_paragraph_merged_present"] += "merged" in paragraph.attrib
                                    shard["master_paragraph_merged_true"] += paragraph.get("merged") in ("true", "1")
                                def visit_style(node, parent):
                                    if node.tag == PARA + "p":
                                        shard["master_style_paragraphs"] += 1
                                        shard["master_style_non_direct_paragraphs"] += parent is not child
                                        master_style_values[0].append(node.get("paraPrIDRef"))
                                        master_style_values[1].append(node.get("styleIDRef"))
                                    elif node.tag == PARA + "run":
                                        shard["master_style_runs"] += 1
                                        shard["master_style_non_direct_runs"] += parent.tag != PARA + "p"
                                        master_style_values[2].append(node.get("charPrIDRef"))
                                        count_run_metadata(shard["master_run_metadata"], node)
                                        count_run_structure(shard, "master", node, parent)
                                    elif node.tag == PARA + "t":
                                        count_text_node(shard, "master", node, parent)
                                    for nested in node:
                                        visit_style(nested, node)
                                for direct in child:
                                    visit_style(direct, child)
                        if name.startswith("Contents/section") and name.endswith(".xml"):
                            master_refs.extend(node.get("idRef") for node in document.iter(PARA + "masterPage"))
                            shard["master_count_declarations"] += sum("masterPageCnt" in node.attrib for node in document.iter(PARA + "secPr"))
                            for parent in document.iter():
                                for run in parent:
                                    if run.tag == PARA + "run":
                                        count_run_metadata(shard["section_run_metadata"], run)
                                        count_run_structure(shard, "section", run, parent)
                                    elif run.tag == PARA + "t":
                                        count_text_node(shard, "section", run, parent)
                    for ref in master_refs:
                        shard["master_refs"] += 1
                        if not ref:
                            shard["master_absent"] += 1
                        elif master_ids.count(ref) == 1:
                            shard["master_resolved"] += 1
                        elif master_ids.count(ref) > 1:
                            shard["master_ambiguous"] += 1
                        else:
                            shard["master_missing"] += 1
                    for index, values in enumerate(master_style_values):
                        table = header_tables[index]
                        for raw in values:
                            if raw is None:
                                shard["master_style_ref_absent"][index] += 1
                            else:
                                shard["master_style_ref_present"][index] += 1
                                if table is None:
                                    shard["master_style_ref_absent_table"][index] += 1
                                elif int(raw) in table:
                                    shard["master_style_ref_resolved"][index] += 1
                                else:
                                    shard["master_style_ref_missing"][index] += 1
                    shard["accepted"] += 1
            except BadZipFile:
                shard["rejected_zip"] += 1
    total = {}
    for key, value in shards[0].items():
        if isinstance(value, list):
            total[key] = [sum(shard[key][i] for shard in shards) for i in range(len(value))]
        elif isinstance(value, dict):
            names = set().union(*(shard[key] for shard in shards))
            total[key] = {name: sum(shard[key].get(name, 0) for shard in shards) for name in sorted(names)}
        else:
            total[key] = sum(shard[key] for shard in shards)
    print(json.dumps({"total": total, "shards": shards}, sort_keys=True))


if __name__ == "__main__":
    self_test_master_line_segments()
    if sys.argv[1:] == ["--self-test"]:
        print("master line segments oracle self-test passed")
    elif not sys.argv[1:]:
        main()
    else:
        raise SystemExit("usage: hwpx-manifest-xml-oracle.py [--self-test]")
