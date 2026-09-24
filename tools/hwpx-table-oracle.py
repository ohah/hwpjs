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


def inspect_metrics(cell, stats, border_ids):
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
    rows = [child for child in table if child.tag == P + "tr"]
    declared_rows = optional_int(table, "rowCnt")
    declared_cols = optional_int(table, "colCnt")
    stats["rows"] += len(rows)
    stats["missing_rowCnt"] += declared_rows is None
    stats["missing_colCnt"] += declared_cols is None
    stats["row_count_mismatch"] += declared_rows is not None and declared_rows != len(rows)
    if declared_rows is not None and declared_cols is not None and declared_rows * declared_cols > 100_000:
        raise ValueError("HWPX table oracle declared grid exceeds census limit")
    occupied = set()
    table_issues = Counter()
    for row_index, row in enumerate(rows):
        cells = [child for child in row if child.tag == P + "tc"]
        stats["cells"] += len(cells)
        table_issues["empty_row"] += not cells
        for cell in cells:
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
                        for table in section.iter(P + "tbl"):
                            try:
                                inspect_table(table, stats, samples, relative, border_ids)
                                inspect_table(table, shard, [], relative, border_ids)
                            except ValueError as exc:
                                raise ValueError(f"{relative}:{name}: {exc}") from exc
                    stats["accepted"] += 1
                    shard["accepted"] += 1
            except BadZipFile:
                stats["rejected_zip"] += 1
                shard["rejected_zip"] += 1
    print(json.dumps({"counts": dict(stats), "shards": [dict(shard) for shard in shards], "samples": samples}, ensure_ascii=False, indent=2))


def self_test():
    cases = (
        ("<p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='2'/></p:tc></p:tr></p:tbl>", {"tables": 1, "cells": 1, "grid_slots": 2, "cell_slots": 2, "uncovered_slots": 0}),
        ("<p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl>", {"overlap": 1, "uncovered_slots": 1}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='0' colSpan='1'/></p:tc></p:tr></p:tbl>", {"zero_span": 1, "outside_grid": 1, "uncovered_slots": 1}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc hasMargin='false'><p:cellSz width='10' height='0'/><p:cellMargin left='-21280' right='4294948081' top='0' bottom='141'/></p:tc></p:tr></p:tbl>", {"size_elements": 1, "margin_elements": 1, "zero_size_height": 1, "negative_margin_left": 1, "highbit_margin_right": 1, "margin_flag_false_with_element": 1}),
        ("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc name='A&amp;B' header='true' protect='false' editable='1' dirty='0' borderFillIDRef='4294967295'/></p:tr></p:tbl>", {"name_present": 1, "name_utf8_bytes": 3, "header_true": 1, "protect_false": 1, "editable_true": 1, "dirty_false": 1, "border_sum": 4294967295}),
        ("<p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc/><p:tc name='' header='false' borderFillIDRef='0'/></p:tr></p:tbl>", {"name_absent": 1, "name_present": 1, "name_empty": 1, "header_absent": 1, "header_false": 1, "border_absent": 1, "border_zero": 1}),
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
    incomplete = ET.fromstring("<p:tbl xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellSpan rowSpan='-1' colSpan='1'/></p:tc></p:tr></p:tbl>")
    try:
        inspect_table(incomplete, Counter(), [], "self-test")
    except ValueError:
        pass
    else:
        raise AssertionError("malformed span hidden by missing address")
    print("HWPX table oracle self-test: grid and numeric canaries passed")


if __name__ == "__main__":
    self_test() if sys.argv[1:] == ["--self-test"] else main()
