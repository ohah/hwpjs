"""Independent read-only OPF application/xml census for the local HWPX corpus.

This uses Python zipfile/ElementTree, not the Zig ZIP or XML implementations.
It checks syntax and counts; it does not validate HWPX XML schemas or meaning.
"""

import json
import re
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
                section_text_nodes=[0] * 6, master_text_nodes=[0] * 6,
                section_text_children={}, master_text_children={},
                section_text_child_classes=[0] * 4, master_text_child_classes=[0] * 4,
                section_tab_fields=[0] * 21, master_tab_fields=[0] * 21,
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
    main()
