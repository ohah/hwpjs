"""Independent fixture expectations using ZIP, ElementTree and Decimal.

This covers the observed chart fixture, not general formula syntax or editing.
"""
import decimal
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def results(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("Contents/section0.xml"))
    for table in root.iter(P + "tbl"):
        cells = {}
        for row in table.findall(P + "tr"):
            for cell in row.findall(P + "tc"):
                address = cell.find(P + "cellAddr")
                coordinate = (int(address.get("colAddr")), int(address.get("rowAddr")))
                if coordinate in cells:
                    raise ValueError("duplicate address")
                cells[coordinate] = cell
        for (column, row), cell in cells.items():
            for field in cell.iter(P + "fieldBegin"):
                if field.get("type") != "FORMULA":
                    continue
                formula = next(value.text for value in field.find(P + "parameters") if value.get("name") == "Formula")
                match = re.fullmatch(r"=(SUM|AVG)\(([A-Z]+|\?)([0-9]+|\?):([A-Z]+|\?)([0-9]+|\?)\)", formula)
                if match is None:
                    raise ValueError(formula)

                def col(value):
                    if value == "?":
                        return column
                    number = 0
                    for character in value:
                        number = number * 26 + ord(character) - 64
                    return number - 1

                def line(value):
                    return row if value == "?" else int(value) - 1

                values = []
                for y in range(line(match[3]), line(match[5]) + 1):
                    for x in range(col(match[2]), col(match[4]) + 1):
                        text = "".join(part.text or "" for part in cells[x, y].iter(P + "t"))
                        values.append(decimal.Decimal(text.replace(",", "")))
                value = sum(values) / (len(values) if match[1] == "AVG" else 1)
                yield field.get("id"), formula, value, len(values)


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx"
    for result in results(path):
        print(*result)
