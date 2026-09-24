"""Independent read-only OPF application/xml census for the local HWPX corpus.

This uses Python zipfile/ElementTree, not the Zig ZIP or XML implementations.
It checks syntax and counts; it does not validate HWPX XML schemas or meaning.
"""

import json
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
                                    for nested in node:
                                        visit_style(nested, node)
                                for direct in child:
                                    visit_style(direct, child)
                        if name.startswith("Contents/section") and name.endswith(".xml"):
                            master_refs.extend(node.get("idRef") for node in document.iter(PARA + "masterPage"))
                            shard["master_count_declarations"] += sum("masterPageCnt" in node.attrib for node in document.iter(PARA + "secPr"))
                            for run in document.iter(PARA + "run"):
                                count_run_metadata(shard["section_run_metadata"], run)
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
    total = {key: ([sum(shard[key][i] for shard in shards) for i in range(len(shards[0][key]))]
                   if isinstance(shards[0][key], list) else sum(shard[key] for shard in shards))
             for key in shards[0]}
    print(json.dumps({"total": total, "shards": shards}, sort_keys=True))


if __name__ == "__main__":
    main()
