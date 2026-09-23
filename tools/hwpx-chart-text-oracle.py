"""Read-only, stdlib-only cross-check of chart text in the local HWPX corpus.

This intentionally uses Python's ZIP/XML parsers rather than the product Zig
parser. It inventories Chart/*.xml members, not HWPX chartIDRef reachability.
"""

import json
import re
from pathlib import Path
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile


ROOTS = (
    Path("legacy/rust/crates/hwp-core/tests/fixtures"),
    Path("reference/rhwp/samples"),
)
CHART_MEMBER = re.compile(r"(?:^|/)Chart/[^/]+\.xml$", re.IGNORECASE)
CHART = "{http://schemas.openxmlformats.org/drawingml/2006/chart}"
MAX_PACKAGE_BYTES = 25_000_000
MAX_CHART_BYTES = 32 * 1024 * 1024


def main() -> None:
    result = {
        "chart_parts": 0,
        "values": 0,
        "value_bytes": 0,
        "empty_values": 0,
        "max_value_bytes": 0,
        "formulas": 0,
        "formula_bytes": 0,
        "empty_formulas": 0,
        "max_formula_bytes": 0,
        "rejected_zip": 0,
    }
    for root in ROOTS:
        for path in root.rglob("*.hwpx"):
            try:
                if path.stat().st_size > MAX_PACKAGE_BYTES:
                    raise ValueError("HWPX oracle package limit exceeded")
                with ZipFile(path) as archive:
                    for member in archive.infolist():
                        if not CHART_MEMBER.search(member.filename):
                            continue
                        if member.file_size > MAX_CHART_BYTES:
                            raise ValueError("HWPX oracle chart limit exceeded")
                        with archive.open(member) as stream:
                            source = stream.read(MAX_CHART_BYTES + 1)
                        if len(source) > MAX_CHART_BYTES:
                            raise ValueError("HWPX oracle chart limit exceeded")
                        chart = ElementTree.fromstring(source)
                        result["chart_parts"] += 1
                        for kind in ("numCache", "strCache", "numLit", "strLit"):
                            for container in chart.iter(CHART + kind):
                                for point in container.findall(CHART + "pt"):
                                    for value in point.findall(CHART + "v"):
                                        size = len("".join(value.itertext()).encode("utf-8"))
                                        result["values"] += 1
                                        result["value_bytes"] += size
                                        result["empty_values"] += size == 0
                                        result["max_value_bytes"] = max(result["max_value_bytes"], size)
                        for kind in ("numRef", "strRef"):
                            for reference in chart.iter(CHART + kind):
                                for formula in reference.findall(CHART + "f"):
                                    size = len("".join(formula.itertext()).encode("utf-8"))
                                    result["formulas"] += 1
                                    result["formula_bytes"] += size
                                    result["empty_formulas"] += size == 0
                                    result["max_formula_bytes"] = max(result["max_formula_bytes"], size)
            except BadZipFile:
                result["rejected_zip"] += 1
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
