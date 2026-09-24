"""Read-only HWPX table shape census using Python's ZIP and XML parsers."""

import json
import re
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


ROOTS = (Path("legacy/rust/crates/hwp-core/tests/fixtures"), Path("reference/rhwp/samples"))
OPF = "{http://www.idpf.org/2007/opf/}"
P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
H = "{http://www.hancom.co.kr/hwpml/2011/head}"
SECTION = "{http://www.hancom.co.kr/hwpml/2011/section}sec"


def master_path(name):
    prefix = "Contents/masterpage"
    return (name.startswith(prefix) and name.endswith(".xml")
            and bool(name[len(prefix):-4])
            and name[len(prefix):-4].isascii()
            and name[len(prefix):-4].isdecimal())


def master_tables(root):
    if root.tag != "masterPage":
        raise ValueError("HWPX table oracle invalid master-page root")
    for child in root:
        if child.tag == P + "subList":
            yield from child.iter(P + "tbl")
PARA_LIST_FIELDS = ("id", "textDirection", "lineWrap", "vertAlign", "linkListIDRef", "linkListNextIDRef", "textWidth", "textHeight", "hasTextRef", "hasNumRef", "metatag")
PARA_LIST_ENUMS = {"textDirection": {"HORIZONTAL", "VERTICAL", "VERTICALALL"}, "lineWrap": {"BREAK", "SQUEEZE", "KEEP"}, "vertAlign": {"TOP", "CENTER", "BOTTOM"}}
TABLE_SHAPE_CHILD_FIELDS = {
    "sz": ("width", "widthRelTo", "height", "heightRelTo", "protect"),
    "pos": ("treatAsChar", "affectLSpacing", "flowWithText", "allowOverlap", "holdAnchorAndSO", "vertRelTo", "horzRelTo", "vertAlign", "horzAlign", "vertOffset", "horzOffset"),
    "outMargin": ("left", "right", "top", "bottom"),
    "caption": ("side", "fullSz", "width", "gap", "lastWidth"),
    "shapeComment": (),
    "parameterset": (),
    "metaTag": (),
    "label": ("topmargin", "leftmargin", "boxwidth", "boxlength", "boxmarginhor", "boxmarginver", "labelcols", "labelrows", "landscape", "pagewidth", "pageheight"),
}
TABLE_SHAPE_ATTRIBUTES = ("id", "zOrder", "numberingType", "textWrap", "textFlow", "lock", "dropcapstyle")
TABLE_SHAPE_ENUMS = {
    ("attr", "numberingType"): {"NONE", "PICTURE", "TABLE", "EQUATION"},
    ("attr", "textWrap"): {"SQUARE", "TOP_AND_BOTTOM", "BEHIND_TEXT", "IN_FRONT_OF_TEXT"},
    ("attr", "textFlow"): {"BOTH_SIDES", "LEFT_ONLY", "RIGHT_ONLY", "LARGEST_ONLY"},
    ("attr", "dropcapstyle"): {"None", "DoubleLine", "TripleLine", "Margin"},
    ("sz", "widthRelTo"): {"PAPER", "PAGE", "COLUMN", "PARA", "ABSOLUTE"},
    ("sz", "heightRelTo"): {"PAPER", "PAGE", "ABSOLUTE"},
    ("pos", "vertRelTo"): {"PAPER", "PAGE", "PARA"},
    ("pos", "horzRelTo"): {"PAPER", "PAGE", "COLUMN", "PARA"},
    ("pos", "vertAlign"): {"TOP", "CENTER", "BOTTOM", "INSIDE", "OUTSIDE"},
    ("pos", "horzAlign"): {"LEFT", "CENTER", "RIGHT", "INSIDE", "OUTSIDE"},
    ("caption", "side"): {"LEFT", "RIGHT", "TOP", "BOTTOM"},
    ("label", "landscape"): {"WIDELY", "NARROWLY"},
}
TABLE_SHAPE_BOOLEANS = {("attr", "lock"), ("sz", "protect"), ("caption", "fullSz")} | {("pos", field) for field in ("treatAsChar", "affectLSpacing", "flowWithText", "allowOverlap", "holdAnchorAndSO")}
TABLE_SHAPE_SIGNED = {("attr", "zOrder"), ("caption", "width"), ("caption", "gap")} | {("outMargin", field) for field in ("left", "right", "top", "bottom")} | {("pos", field) for field in ("vertOffset", "horzOffset")}
TABLE_CELL_ATTRIBUTES = {"name", "header", "hasMargin", "protect", "editable", "dirty", "borderFillIDRef"}
TABLE_CELL_DIRECT_NAMES = frozenset(("cellAddr", "cellSpan", "cellSz", "cellMargin", "subList"))


def inspect_shape_field(node, kind, field, stats):
    key = f"table_shape_{kind}_{field}"
    raw = node.get(field)
    stats[key + "_present"] += raw is not None
    if raw is None:
        return
    if (kind, field) in TABLE_SHAPE_ENUMS:
        stats[key + "_unknown"] += raw not in TABLE_SHAPE_ENUMS[(kind, field)]
        stats[key + "_" + (raw if raw in TABLE_SHAPE_ENUMS[(kind, field)] else "unknown_value")] += 1
        if raw not in TABLE_SHAPE_ENUMS[(kind, field)]:
            stats[key + "_unrecognized_" + (raw if len(raw) <= 64 else "long")] += 1
    elif (kind, field) in TABLE_SHAPE_BOOLEANS:
        stats[key + "_true"] += optional_bool(node, field) is True
    else:
        value = optional_margin_int(node, field) if (kind, field) in TABLE_SHAPE_SIGNED else optional_int(node, field)
        stats[key + "_sum"] += value
        stats[key + "_zero"] += value == 0
        stats[key + "_negative"] += value < 0
        stats[key + "_highbit"] += value >= 0x80000000


def read_part(archive, name, limit):
    item = archive.getinfo(name)
    if item.file_size > limit:
        raise ValueError("HWPX table oracle part exceeds byte limit")
    with archive.open(item) as stream:
        value = stream.read(limit + 1)
    if len(value) > limit:
        raise ValueError("HWPX table oracle part exceeds byte limit")
    return value


def optional_int(node, name):
    value = node.get(name)
    if value is None:
        return None
    value = value.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value):
        raise ValueError(f"HWPX table oracle invalid unsigned attribute {name}")
    number = int(value)
    if number < 0 or number > 0xFFFFFFFF:
        raise ValueError(f"HWPX table oracle unsigned attribute outside u32 {name}={value!r}")
    return number


def optional_bool(node, name):
    value = node.get(name)
    if value is None:
        return None
    value = value.strip(" \t\r\n")
    if value in ("true", "1"):
        return True
    if value in ("false", "0"):
        return False
    raise ValueError(f"HWPX table oracle invalid boolean attribute {name}")


def optional_margin_int(node, name):
    value = node.get(name)
    if value is None:
        return None
    value = value.strip(" \t\r\n")
    if not re.fullmatch(r"[+-]?[0-9]+", value):
        raise ValueError(f"HWPX table oracle invalid signed attribute {name}={value!r}")
    number = int(value)
    if number < -0x80000000 or number > 0xFFFFFFFF:
        raise ValueError(f"HWPX table oracle margin attribute outside supported lexical union {name}={value!r}")
    return number


def inspect_cell_sub_lists(cell, stats):
    lists = [child for child in cell if child.tag == P + "subList"]
    stats["sublist_missing_cells"] += not lists
    stats["sublist_duplicate_cells"] += len(lists) > 1
    for sublist in lists:
        stats["sublists"] += 1
        direct_paragraphs = sum(child.tag == P + "p" for child in sublist)
        stats["sublist_direct_paragraphs"] += direct_paragraphs
        stats["sublist_other_direct"] += len(sublist) - direct_paragraphs
        stats["sublist_empty"] += len(sublist) == 0
        stats["sublist_other_attributes"] += sum(name not in PARA_LIST_FIELDS for name in sublist.attrib)
        for name in PARA_LIST_FIELDS:
            raw = sublist.get(name)
            stats[f"sublist_{name}_present"] += raw is not None
            stats[f"sublist_{name}_empty"] += raw == "" if raw is not None else False
            if raw is None:
                continue
            if name in PARA_LIST_ENUMS:
                stats["sublist_unknown_enums"] += raw not in PARA_LIST_ENUMS[name]
            elif name in ("linkListIDRef", "linkListNextIDRef", "textWidth", "textHeight"):
                value = optional_int(sublist, name)
                if name in ("textWidth", "textHeight"):
                    stats[f"sublist_{name}_sum"] += value
            elif name in ("hasTextRef", "hasNumRef"):
                stats[f"sublist_{name}_true"] += optional_bool(sublist, name) is True


def inspect_metrics(cell, stats, border_ids):
    inspect_cell_sub_lists(cell, stats)
    sizes = [child for child in cell if child.tag == P + "cellSz"]
    margins = [child for child in cell if child.tag == P + "cellMargin"]
    stats["missing_size"] += not sizes
    stats["duplicate_size"] += len(sizes) > 1
    stats["missing_margin"] += not margins
    stats["duplicate_margin"] += len(margins) > 1
    has_margin = optional_bool(cell, "hasMargin")
    stats["missing_hasMargin"] += has_margin is None
    stats["true_hasMargin"] += has_margin is True
    stats["false_hasMargin"] += has_margin is False
    if len(sizes) == 1:
        stats["size_elements"] += 1
        for field in ("width", "height"):
            value = optional_int(sizes[0], field)
            stats[f"missing_size_{field}"] += value is None
            if value is not None:
                stats[f"size_{field}_sum"] += value
                stats[f"zero_size_{field}"] += value == 0
    if len(margins) == 1:
        stats["margin_elements"] += 1
        for field in ("left", "right", "top", "bottom"):
            value = optional_margin_int(margins[0], field)
            stats[f"missing_margin_{field}"] += value is None
            if value is not None:
                stats[f"margin_{field}_sum"] += value
                stats[f"zero_margin_{field}"] += value == 0
                stats[f"negative_margin_{field}"] += value < 0
                stats[f"highbit_margin_{field}"] += value >= 0x80000000
                low = f"min_margin_{field}"
                high = f"max_margin_{field}"
                stats[low] = min(stats[low], value) if low in stats else value
                stats[high] = max(stats[high], value) if high in stats else value
    stats["margin_flag_true_without_element"] += has_margin is True and not margins
    stats["margin_flag_false_with_element"] += has_margin is False and bool(margins)
    name = cell.get("name")
    stats["name_absent"] += name is None
    stats["name_present"] += name is not None
    if name is not None:
        stats["name_empty"] += name == ""
        stats["name_utf8_bytes"] += len(name.encode("utf-8"))
    for flag in ("header", "protect", "editable", "dirty"):
        value = optional_bool(cell, flag)
        stats[f"{flag}_absent"] += value is None
        stats[f"{flag}_true"] += value is True
        stats[f"{flag}_false"] += value is False
    border = optional_int(cell, "borderFillIDRef")
    stats["border_absent"] += border is None
    stats["border_present"] += border is not None
    if border is not None:
        stats["border_zero"] += border == 0
        stats["border_sum"] += border
    stats["border_ref_absent"] += border is None
    stats["border_ref_absent_table"] += border is not None and border_ids is None
    stats["border_ref_resolved"] += border is not None and border_ids is not None and border in border_ids
    stats["border_ref_missing_target"] += border is not None and border_ids is not None and border not in border_ids


def inspect_table(table, stats, samples, path, border_ids=None):
    stats["tables"] += 1
    for field in TABLE_SHAPE_ATTRIBUTES:
        inspect_shape_field(table, "attr", field, stats)
    shape_counts = Counter()
    for child in table:
        local = child.tag.removeprefix(P) if child.tag.startswith(P) else None
        if local in TABLE_SHAPE_CHILD_FIELDS:
            shape_counts[local] += 1
            stats[f"table_shape_{local}_elements"] += 1
            for field in TABLE_SHAPE_CHILD_FIELDS[local]:
                inspect_shape_field(child, local, field, stats)
            if local == "caption":
                nested = Counter()
                inspect_cell_sub_lists(child, nested)
                stats["table_shape_caption_sub_lists"] += nested["sublists"]
                stats["table_shape_caption_missing_sub_list"] += nested["sublist_missing_cells"]
                stats["table_shape_caption_duplicate_sub_list"] += nested["sublist_duplicate_cells"]
                stats["table_shape_caption_direct_paragraphs"] += nested["sublist_direct_paragraphs"]
                stats["table_shape_caption_unknown_enums"] += nested["sublist_unknown_enums"]
                stats["table_shape_caption_other_attributes"] += nested["sublist_other_attributes"]
                stats["table_shape_caption_other_direct_children"] += nested["sublist_other_direct"] + len(child) - nested["sublists"]
        elif local not in ("tr", "inMargin", "cellzoneList"):
            stats["table_shape_other_direct"] += 1
    for local in TABLE_SHAPE_CHILD_FIELDS:
        stats[f"table_shape_{local}_missing"] += shape_counts[local] == 0
        stats[f"table_shape_{local}_duplicate"] += shape_counts[local] > 1
    declared_rows = optional_int(table, "rowCnt")
    declared_cols = optional_int(table, "colCnt")
    page_break = table.get("pageBreak")
    stats["table_pageBreak_absent"] += page_break is None
    if page_break is not None:
        stats[f"table_pageBreak_{page_break if page_break in ('NONE', 'TABLE', 'CELL') else 'unknown'}"] += 1
    for flag in ("repeatHeader", "noAdjust"):
        value = optional_bool(table, flag)
        stats[f"table_{flag}_absent"] += value is None
        stats[f"table_{flag}_true"] += value is True
        stats[f"table_{flag}_false"] += value is False
    spacing = optional_int(table, "cellSpacing")
    stats["table_cellSpacing_absent"] += spacing is None
    if spacing is not None:
        stats["table_cellSpacing_zero"] += spacing == 0
        stats["table_cellSpacing_sum"] += spacing
    border_ref = optional_int(table, "borderFillIDRef")
    stats["table_border_absent"] += border_ref is None
    if border_ref is not None:
        stats["table_border_zero"] += border_ref == 0
        stats["table_border_sum"] += border_ref
    stats["table_border_ref_absent_table"] += border_ref is not None and border_ids is None
    stats["table_border_ref_resolved"] += border_ref is not None and border_ids is not None and border_ref in border_ids
    stats["table_border_ref_missing_target"] += border_ref is not None and border_ids is not None and border_ref not in border_ids
    stats["table_border_ref_missing_zero"] += border_ref == 0 and border_ids is not None and border_ref not in border_ids
    in_margins = [child for child in table if child.tag == P + "inMargin"]
    stats["table_inMargin_missing"] += not in_margins
    stats["table_inMargin_duplicate"] += len(in_margins) > 1
    for margin in in_margins:
        stats["table_inMargin_elements"] += 1
        for field in ("left", "right", "top", "bottom"):
            value = optional_margin_int(margin, field)
            stats[f"table_inMargin_{field}_absent"] += value is None
            if value is not None:
                stats[f"table_inMargin_{field}_zero"] += value == 0
                stats[f"table_inMargin_{field}_negative"] += value < 0
                stats[f"table_inMargin_{field}_highbit"] += value >= 0x80000000
                stats[f"table_inMargin_{field}_sum"] += value
    zone_lists = [child for child in table if child.tag == P + "cellzoneList"]
    stats["table_cellzoneList_missing"] += not zone_lists
    stats["table_cellzoneList_duplicate"] += len(zone_lists) > 1
    for zone_list in zone_lists:
        stats["table_cellzoneList_elements"] += 1
        zones = [child for child in zone_list if child.tag == P + "cellzone"]
        stats["table_cellzoneList_empty"] += not zones
        stats["table_cellzoneList_other_direct"] += len(zone_list) - len(zones)
        for zone in zones:
            stats["table_cellzones"] += 1
            coords = [optional_int(zone, field) for field in ("startRowAddr", "startColAddr", "endRowAddr", "endColAddr")]
            for field, value in zip(("startRowAddr", "startColAddr", "endRowAddr", "endColAddr"), coords):
                stats[f"table_cellzone_{field}_absent"] += value is None
                if value is not None:
                    stats[f"table_cellzone_{field}_sum"] += value
            sr, sc, er, ec = coords
            stats["table_cellzone_inverted"] += (sr is not None and er is not None and sr > er) or (sc is not None and ec is not None and sc > ec)
            stats["table_cellzone_outside_grid"] += (declared_rows is not None and any(value is not None and value >= declared_rows for value in (sr, er))) or (declared_cols is not None and any(value is not None and value >= declared_cols for value in (sc, ec)))
            zone_ref = optional_int(zone, "borderFillIDRef")
            stats["table_cellzone_border_absent"] += zone_ref is None
            if zone_ref is not None:
                stats["table_cellzone_border_zero"] += zone_ref == 0
                stats["table_cellzone_border_sum"] += zone_ref
                stats["table_cellzone_border_ref_absent_table"] += border_ids is None
                stats["table_cellzone_border_ref_resolved"] += border_ids is not None and zone_ref in border_ids
                stats["table_cellzone_border_ref_missing_target"] += border_ids is not None and zone_ref not in border_ids
    rows = [child for child in table if child.tag == P + "tr"]
    stats["rows"] += len(rows)
    stats["missing_rowCnt"] += declared_rows is None
    stats["missing_colCnt"] += declared_cols is None
    stats["row_count_mismatch"] += declared_rows is not None and declared_rows != len(rows)
    if declared_rows is not None and declared_cols is not None and declared_rows * declared_cols > 100_000:
        raise ValueError("HWPX table oracle declared grid exceeds census limit")
    occupied = set()
    table_issues = Counter()
    for row_index, row in enumerate(rows):
        stats["table_row_other_attributes"] += len(row.attrib)
        cells = [child for child in row if child.tag == P + "tc"]
        stats["table_row_other_direct"] += len(row) - len(cells)
        stats["table_row_foreign_direct"] += sum(not child.tag.startswith(P) for child in row if child.tag != P + "tc")
        stats["cells"] += len(cells)
        table_issues["empty_row"] += not cells
        for cell in cells:
            stats["table_cell_other_attributes"] += sum(name not in TABLE_CELL_ATTRIBUTES for name in cell.attrib)
            known_sequence = []
            for child in cell:
                local = child.tag.removeprefix(P) if child.tag.startswith(P) else None
                if local not in TABLE_CELL_DIRECT_NAMES:
                    stats["table_cell_other_direct"] += 1
                    stats["table_cell_foreign_direct"] += not child.tag.startswith(P)
                    continue
                stats["table_cell_known_direct"] += 1
                known_sequence.append(local)
            stats["table_cell_first_known_subList"] += bool(known_sequence) and known_sequence[0] == "subList"
            stats["table_cell_last_known_address"] += bool(known_sequence) and known_sequence[-1] == "cellAddr"
            common = known_sequence == ["subList", "cellAddr", "cellSpan", "cellSz", "cellMargin"]
            address_last = known_sequence == ["subList", "cellSpan", "cellSz", "cellMargin", "cellAddr"]
            stats["table_cell_common_sequence"] += common
            stats["table_cell_addr_last_sequence"] += address_last
            stats["table_cell_other_known_sequence"] += not common and not address_last
            stats["table_cell_sequence_" + "/".join(known_sequence)] += 1
            inspect_metrics(cell, stats, border_ids)
            addresses = [child for child in cell if child.tag == P + "cellAddr"]
            spans = [child for child in cell if child.tag == P + "cellSpan"]
            stats["missing_addr"] += not addresses
            stats["missing_span"] += not spans
            stats["duplicate_addr"] += len(addresses) > 1
            stats["duplicate_span"] += len(spans) > 1
            col = optional_int(addresses[0], "colAddr") if len(addresses) == 1 else None
            row_value = optional_int(addresses[0], "rowAddr") if len(addresses) == 1 else None
            col_span = optional_int(spans[0], "colSpan") if len(spans) == 1 else None
            row_span = optional_int(spans[0], "rowSpan") if len(spans) == 1 else None
            stats["missing_coordinate"] += len(addresses) == 1 and (col is None or row_value is None)
            stats["missing_span_value"] += len(spans) == 1 and (col_span is None or row_span is None)
            table_issues["row_address_mismatch"] += row_value is not None and row_value != row_index
            table_issues["zero_span"] += (col_span is not None and col_span == 0) or (row_span is not None and row_span == 0)
            if len(addresses) != 1 or len(spans) != 1 or None in (col, row_value, col_span, row_span):
                continue
            if declared_rows is None or declared_cols is None or min(col, row_value, col_span, row_span) < 0:
                continue
            if row_value + row_span > declared_rows or col + col_span > declared_cols:
                table_issues["outside_grid"] += 1
                continue
            if row_span * col_span > 100_000:
                raise ValueError("HWPX table oracle cell span exceeds census limit")
            table_issues["cell_slots"] += row_span * col_span
            for r in range(row_value, row_value + row_span):
                for c in range(col, col + col_span):
                    if (r, c) in occupied:
                        table_issues["overlap"] += 1
                    occupied.add((r, c))
    if declared_rows is not None and declared_cols is not None:
        grid = declared_rows * declared_cols
        table_issues["grid_slots"] = grid
        table_issues["uncovered_slots"] = grid - len(occupied)
    stats.update(table_issues)
    geometric_issues = ("empty_row", "row_address_mismatch", "zero_span", "outside_grid", "overlap", "uncovered_slots")
    if (declared_rows is not None and declared_rows != len(rows)) or any(table_issues[name] for name in geometric_issues):
        if len(samples) < 12:
            samples.append({"path": path, "rows": declared_rows, "cols": declared_cols, "direct_rows": len(rows), "issues": dict(table_issues)})


def main():
    stats = Counter()
    shards = [Counter() for _ in range(8)]
    master_stats = Counter()
    master_shards = [Counter() for _ in range(8)]
    samples = []
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            relative = str(path.relative_to(root))
            shard = shards[(sum(relative.encode("utf-8")) + root_index) % 8]
            if path.stat().st_size > 25_000_000:
                raise ValueError("HWPX table oracle package exceeds byte limit")
            try:
                with ZipFile(path) as archive:
                    if "META-INF/manifest.xml" in archive.namelist() and b"encryption-data" in read_part(archive, "META-INF/manifest.xml", 2_000_000):
                        stats["encrypted"] += 1
                        shard["encrypted"] += 1
                        continue
                    opf = ET.fromstring(read_part(archive, "Contents/content.hpf", 2_000_000))
                    header = ET.fromstring(read_part(archive, "Contents/header.xml", 32 * 1024 * 1024))
                    groups = header.findall(H + "refList/" + H + "borderFills")
                    if len(groups) > 1:
                        raise ValueError(f"{relative}: duplicate header borderFills")
                    border_values = [optional_int(node, "id") for node in groups[0].findall(H + "borderFill")] if groups else None
                    if border_values is not None and (None in border_values or len(set(border_values)) != len(border_values)):
                        raise ValueError(f"{relative}: missing or duplicate borderFill ID")
                    border_ids = set(border_values) if border_values is not None else None
                    items = {item.get("id"): item.get("href") for item in opf.findall(OPF + "manifest/" + OPF + "item")}
                    master_names = [item.get("href") for item in opf.findall(OPF + "manifest/" + OPF + "item")
                                    if item.get("media-type") == "application/xml" and master_path(item.get("href") or "")]
                    spine = opf.find(OPF + "spine")
                    if spine is None:
                        raise ValueError("HWPX table oracle missing spine")
                    for itemref in spine.findall(OPF + "itemref"):
                        name = items[itemref.get("idref")]
                        if not name.endswith(".xml"):
                            continue
                        section = ET.fromstring(read_part(archive, name, 128 * 1024 * 1024))
                        if section.tag != SECTION:
                            continue
                        stats["sections"] += 1
                        shard["sections"] += 1
                        switch_tables = sum(1 for node in section.iter(P + "switch") for _ in node.iter(P + "tbl"))
                        stats["section_switch_tables"] += switch_tables
                        shard["section_switch_tables"] += switch_tables
                        for table in section.iter(P + "tbl"):
                            try:
                                inspect_table(table, stats, samples, relative, border_ids)
                                inspect_table(table, shard, [], relative, border_ids)
                            except ValueError as exc:
                                raise ValueError(f"{relative}:{name}: {exc}") from exc
                    for name in master_names:
                        page_bytes = read_part(archive, name, 32 * 1024 * 1024)
                        page = ET.fromstring(page_bytes)
                        master_stats["parts"] += 1
                        master_shard = master_shards[(sum(relative.encode("utf-8")) + root_index) % 8]
                        master_shard["parts"] += 1
                        master_stats["xml_bytes"] += len(page_bytes)
                        master_shard["xml_bytes"] += len(page_bytes)
                        element_count = sum(1 for _ in page.iter())
                        master_stats["elements"] += element_count
                        master_shard["elements"] += element_count
                        for child in page:
                            if child.tag == P + "subList":
                                master_stats["sub_lists"] += 1
                                master_shard["sub_lists"] += 1
                                switch_tables = sum(1 for node in child.iter(P + "switch") for _ in node.iter(P + "tbl"))
                                master_stats["master_switch_tables"] += switch_tables
                                master_shard["master_switch_tables"] += switch_tables
                        for table in master_tables(page):
                            try:
                                inspect_table(table, master_stats, [], relative, border_ids)
                                inspect_table(table, master_shard, [], relative, border_ids)
                            except ValueError as exc:
                                raise ValueError(f"{relative}:{name}: {exc}") from exc
                    stats["accepted"] += 1
                    shard["accepted"] += 1
            except BadZipFile:
                stats["rejected_zip"] += 1
                shard["rejected_zip"] += 1
    print(json.dumps({"counts": dict(stats), "shards": [dict(shard) for shard in shards], "master_counts": dict(master_stats), "master_shards": [dict(shard) for shard in master_shards], "samples": samples}, ensure_ascii=False, indent=2))


def self_test():
    cases = (
        ("<p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='2'/></p:tc></p:tr></p:tbl>", {"tables": 1, "cells": 1, "grid_slots": 2, "cell_slots": 2, "uncovered_slots": 0}),
        ("<p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl>", {"overlap": 1, "uncovered_slots": 1}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='0' colSpan='1'/></p:tc></p:tr></p:tbl>", {"zero_span": 1, "outside_grid": 1, "uncovered_slots": 1}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc hasMargin='false'><p:cellSz width='10' height='0'/><p:cellMargin left='-21280' right='4294948081' top='0' bottom='141'/></p:tc></p:tr></p:tbl>", {"size_elements": 1, "margin_elements": 1, "zero_size_height": 1, "negative_margin_left": 1, "highbit_margin_right": 1, "margin_flag_false_with_element": 1}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc name='A&amp;B' header='true' protect='false' editable='1' dirty='0' borderFillIDRef='4294967295'/></p:tr></p:tbl>", {"name_present": 1, "name_utf8_bytes": 3, "header_true": 1, "protect_false": 1, "editable_true": 1, "dirty_false": 1, "border_sum": 4294967295}),
        ("<p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc/><p:tc name='' header='false' borderFillIDRef='0'/></p:tr></p:tbl>", {"name_absent": 1, "name_present": 1, "name_empty": 1, "header_absent": 1, "header_false": 1, "border_absent": 1, "border_zero": 1}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:subList textDirection='FUTURE' textWidth='12' hasTextRef='true'><p:p/><p:future/></p:subList><p:subList/></p:tc></p:tr></p:tbl>", {"sublists": 2, "sublist_duplicate_cells": 1, "sublist_direct_paragraphs": 1, "sublist_other_direct": 1, "sublist_unknown_enums": 1, "sublist_textWidth_sum": 12, "sublist_hasTextRef_true": 1, "sublist_empty": 1}),
        ("<p:tbl rowCnt='1' colCnt='0' pageBreak='FUTURE' repeatHeader='1' noAdjust='false' cellSpacing='12' borderFillIDRef='0'><p:tr/></p:tbl>", {"tables": 1, "table_pageBreak_unknown": 1, "table_repeatHeader_true": 1, "table_noAdjust_false": 1, "table_cellSpacing_sum": 12, "table_border_zero": 1, "table_border_ref_absent_table": 1}),
        ("<p:tbl rowCnt='2' colCnt='2'><p:inMargin left='-2' right='4294967295' top='0'/><p:cellzoneList><p:cellzone startRowAddr='2' endRowAddr='1' startColAddr='1' endColAddr='0' borderFillIDRef='0'/><p:cellzone startRowAddr='3'/></p:cellzoneList></p:tbl>", {"table_inMargin_elements": 1, "table_inMargin_left_negative": 1, "table_inMargin_right_highbit": 1, "table_inMargin_bottom_absent": 1, "table_cellzoneList_elements": 1, "table_cellzones": 2, "table_cellzone_endRowAddr_absent": 1, "table_cellzone_inverted": 1, "table_cellzone_outside_grid": 2, "table_cellzone_border_zero": 1, "table_cellzone_border_absent": 1}),
        ("<p:tbl xmlns:x='urn:foreign' rowCnt='0' colCnt='0' id='4294967295' zOrder='-1' textWrap='THROUGH' lock='1'><x:sz width='99'/><p:sz width='10' protect='true'/><p:pos vertOffset='-2' horzOffset='4294967295'/><p:outMargin left='-3' right='4294967295'/><p:caption side='BOTTOM' fullSz='false' width='-1' gap='850' lastWidth='7'><p:subList textDirection='HORIZONTAL' textWidth='12'><p:p/></p:subList></p:caption><p:label pagewidth='9' pageheight='10'/><p:shapeComment/><p:parameterset/><p:metaTag/><x:caption/></p:tbl>", {"table_shape_attr_id_sum": 4294967295, "table_shape_attr_zOrder_negative": 1, "table_shape_attr_textWrap_unknown": 1, "table_shape_attr_textWrap_unrecognized_THROUGH": 1, "table_shape_attr_lock_true": 1, "table_shape_sz_elements": 1, "table_shape_sz_width_sum": 10, "table_shape_sz_protect_true": 1, "table_shape_pos_vertOffset_negative": 1, "table_shape_pos_horzOffset_highbit": 1, "table_shape_outMargin_left_negative": 1, "table_shape_outMargin_right_highbit": 1, "table_shape_caption_elements": 1, "table_shape_caption_sub_lists": 1, "table_shape_caption_direct_paragraphs": 1, "table_shape_caption_width_negative": 1, "table_shape_label_pageheight_sum": 10, "table_shape_shapeComment_elements": 1, "table_shape_parameterset_elements": 1, "table_shape_metaTag_elements": 1, "table_shape_other_direct": 2}),
        ("<p:tbl rowCnt='0' colCnt='0' textWrap='FUTURE'><p:sz/><p:sz width='1'/><p:caption side='FUTURE'><p:subList textDirection='FUTURE'><p:p/><p:other/></p:subList><p:subList/></p:caption><p:caption/><p:other><p:sz width='100'/></p:other></p:tbl>", {"table_shape_sz_duplicate": 1, "table_shape_pos_missing": 1, "table_shape_sz_width_present": 1, "table_shape_sz_height_present": 0, "table_shape_attr_textWrap_unrecognized_FUTURE": 1, "table_shape_caption_duplicate": 1, "table_shape_caption_sub_lists": 2, "table_shape_caption_duplicate_sub_list": 1, "table_shape_caption_missing_sub_list": 1, "table_shape_caption_other_direct_children": 1, "table_shape_caption_unknown_enums": 1, "table_shape_other_direct": 1}),
        ("<p:tbl xmlns:x='urn:foreign' rowCnt='1' colCnt='1'><p:tr x:flag='1' spare='2'><x:tc/><p:extra/><p:tc x:future='yes' name=''><p:cellSpan rowSpan='1' colSpan='1'/><p:cellAddr rowAddr='0' colAddr='0'/><x:subList/><p:unknown/><p:cellSz width='1' height='1'/><p:cellMargin left='0' right='0' top='0' bottom='0'/><p:subList/></p:tc></p:tr></p:tbl>", {"table_row_other_attributes": 2, "table_row_other_direct": 2, "table_row_foreign_direct": 1, "table_cell_other_attributes": 1, "table_cell_other_direct": 2, "table_cell_foreign_direct": 1, "table_cell_known_direct": 5, "table_cell_first_known_subList": 0, "table_cell_last_known_address": 0}),
        ("<p:tbl xmlns:x='urn:foreign' rowCnt='1' colCnt='1'><p:tr><p:tc><x:before/><p:subList/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='1' height='1'/><p:cellMargin left='0' right='0' top='0' bottom='0'/><p:cellAddr rowAddr='0' colAddr='0'/></p:tc></p:tr></p:tbl>", {"table_cell_other_direct": 1, "table_cell_foreign_direct": 1, "table_cell_known_direct": 5, "table_cell_first_known_subList": 1, "table_cell_last_known_address": 1, "table_cell_addr_last_sequence": 1}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:subList/><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='1' height='1'/><p:cellMargin left='0' right='0' top='0' bottom='0'/></p:tc></p:tr></p:tbl>", {"table_cell_known_direct": 5, "table_cell_common_sequence": 1, "table_cell_addr_last_sequence": 0, "table_cell_other_known_sequence": 0}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:subList/><p:cellSz width='1' height='1'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellMargin left='0' right='0' top='0' bottom='0'/><p:cellAddr rowAddr='0' colAddr='0'/></p:tc></p:tr></p:tbl>", {"table_cell_first_known_subList": 1, "table_cell_last_known_address": 1, "table_cell_common_sequence": 0, "table_cell_addr_last_sequence": 0, "table_cell_other_known_sequence": 1}),
        ("<p:tbl xmlns:x='urn:foreign' rowCnt='1' colCnt='1'><p:tr><p:tc><x:unknown/></p:tc></p:tr></p:tbl>", {"table_cell_other_direct": 1, "table_cell_foreign_direct": 1, "table_cell_known_direct": 0, "table_cell_first_known_subList": 0, "table_cell_last_known_address": 0}),
    )
    for source, expected in cases:
        stats = Counter()
        node = ET.fromstring(source.replace("<p:tbl ", "<p:tbl xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' ", 1))
        inspect_table(node, stats, [], "self-test")
        for name, value in expected.items():
            if stats[name] != value:
                raise AssertionError(f"{name}: expected {value}, got {stats[name]}")
    for bad in ("1_0", "-1", "4294967296", "1.0", ""):
        try:
            optional_int(ET.fromstring(f"<x n='{bad}'/>"), "n")
        except ValueError:
            pass
        else:
            raise AssertionError(f"invalid unsigned value accepted: {bad!r}")
    for source in ("<p:tbl lock='TRUE'/>", "<p:tbl><p:pos vertOffset='-2147483649'/></p:tbl>", "<p:tbl><p:sz width='4294967296'/></p:tbl>", "<p:tbl><p:caption fullSz='TRUE'/></p:tbl>"):
        node = ET.fromstring(source.replace("<p:tbl", "<p:tbl xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'", 1))
        try:
            inspect_table(node, Counter(), [], "self-test")
        except ValueError:
            pass
        else:
            raise AssertionError(f"invalid table shape value accepted: {source}")
    if optional_int(ET.fromstring("<x n='-000'/>"), "n") != 0:
        raise AssertionError("negative lexical zero was not preserved")
    reference = ET.fromstring("<p:tbl xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' rowCnt='1' colCnt='4'><p:tr><p:tc borderFillIDRef='7'/><p:tc borderFillIDRef='9'/><p:tc borderFillIDRef='0'/><p:tc/></p:tr></p:tbl>")
    ref_stats = Counter()
    inspect_table(reference, ref_stats, [], "self-test", {0, 7})
    if (ref_stats["border_ref_resolved"], ref_stats["border_ref_missing_target"], ref_stats["border_ref_absent"]) != (2, 1, 1):
        raise AssertionError("header ID matching or absent reference changed")
    missing_group = Counter()
    inspect_table(reference, missing_group, [], "self-test")
    if missing_group["border_ref_absent_table"] != 3 or missing_group["border_ref_absent"] != 1:
        raise AssertionError("missing header table was treated as an empty ID inventory")
    zero_table_ref = ET.fromstring("<p:tbl xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' rowCnt='0' colCnt='0' borderFillIDRef='0'/>")
    zero_stats = Counter()
    inspect_table(zero_table_ref, zero_stats, [], "self-test", {7})
    if zero_stats["table_border_ref_missing_target"] != 1 or zero_stats["table_border_ref_missing_zero"] != 1:
        raise AssertionError("table border ID zero was treated as absent or resolved")
    incomplete = ET.fromstring("<p:tbl xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellSpan rowSpan='-1' colSpan='1'/></p:tc></p:tr></p:tbl>")
    try:
        inspect_table(incomplete, Counter(), [], "self-test")
    except ValueError:
        pass
    else:
        raise AssertionError("malformed span hidden by missing address")
    master = ET.fromstring("<masterPage xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:subList><p:tbl rowCnt='0' colCnt='0'/><p:p><p:tbl rowCnt='0' colCnt='0'/></p:p><x:tbl/></p:subList><x:subList><p:tbl/></x:subList><p:tbl/></masterPage>")
    if len(list(master_tables(master))) != 2:
        raise AssertionError("master-page table selection crossed a direct subList boundary")
    if not master_path("Contents/masterpage12.xml") or master_path("Contents/masterpageX.xml"):
        raise AssertionError("master-page canonical path recognition changed")
    switch = ET.fromstring("<p:switch xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:case><p:tbl rowCnt='0' colCnt='0'/></p:case></p:switch>")
    if sum(1 for node in switch.iter(P + "switch") for _ in node.iter(P + "tbl")) != 1:
        raise AssertionError("switch table census missed a positive case")
    print("HWPX table oracle self-test: grid, shape, and numeric canaries passed")


if __name__ == "__main__":
    self_test() if sys.argv[1:] == ["--self-test"] else main()
