"""Independent fixture arithmetic only; not a product calculation engine."""
import decimal
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def reference(text, current):
    match = re.fullmatch(r"([A-Za-z]+|\?)([0-9]+|\?)", text)
    if not match:
        raise ValueError("UnsupportedOracleReference: " + text)
    column, row = match.groups()
    col = current[0] if column == "?" else 0
    if column != "?":
        for char in column.upper():
            col = col * 26 + ord(char) - ord("A") + 1
        col -= 1
    row = current[1] if row == "?" else int(row) - 1
    if col < 0 or row < 0:
        raise ValueError("InvalidOracleReference")
    return col, row


def structure_inventory(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("Contents/section0.xml"))
    ordinals = {id(node): index + 1 for index, node in enumerate(root.iter(NS + "p"))}
    allowed, protected = [], []
    for table in root.iter(NS + "tbl"):
        cells = {}
        for row in table.findall(NS + "tr"):
            for cell in row.findall(NS + "tc"):
                address = cell.find(NS + "cellAddr")
                key = int(address.get("colAddr")), int(address.get("rowAddr"))
                span = cell.find(NS + "cellSpan")
                if min(key) < 0 or span is None or int(span.get("colSpan")) != 1 or int(span.get("rowSpan")) != 1:
                    raise ValueError("UnsupportedOracleCellSpan")
                if key in cells:
                    raise ValueError("DuplicateOracleCell")
                cells[key] = cell
        protected_cells, result_cells = set(), set()
        for current, cell in cells.items():
            for field in cell.iter(NS + "fieldBegin"):
                if field.get("type") != "FORMULA":
                    continue
                parameters = {node.get("name"): node.text or "" for node in field.find(NS + "parameters")}
                match = re.fullmatch(r"=(SUM|AVG)\(([^():]+):([^():]+)\)", parameters["Formula"])
                if not match:
                    raise ValueError("UnsupportedOracleFormula")
                first, last = reference(match[2], current), reference(match[3], current)
                if first[0] > last[0] or first[1] > last[1]:
                    raise ValueError("ReversedOracleRange")
                protected_cells.add(current)
                result_cells.add(current)
                for row in range(first[1], last[1] + 1):
                    for column in range(first[0], last[0] + 1):
                        if (column, row) not in cells:
                            raise ValueError("MissingOracleCell")
                        protected_cells.add((column, row))
        for address, cell in cells.items():
            paragraphs = cell.find(NS + "subList").findall(NS + "p")
            for paragraph in paragraphs:
                target = dict(paragraph=ordinals[id(paragraph)], text="".join(node.text or "" for node in paragraph.iter(NS + "t")), result=address in result_cells)
                (protected if address in protected_cells else allowed).append(target)
    return dict(allowed=allowed, protected=protected)


def inspect(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("Contents/section0.xml"))
    parents = {id(child): parent for parent in root.iter() for child in parent}

    def ancestor(node, tag):
        while id(node) in parents:
            node = parents[id(node)]
            if node.tag == NS + tag:
                return node
        raise ValueError("MissingOracleAncestor: " + tag)

    def address(cell):
        node = cell.find(NS + "cellAddr")
        return int(node.get("colAddr")), int(node.get("rowAddr"))

    def text(cell):
        return "".join(
            "".join(node.itertext())
            for node in cell.iter(NS + "t")
            if ancestor(node, "tc") is cell
        )

    rows = []
    for field in root.iter(NS + "fieldBegin"):
        if field.get("type") != "FORMULA":
            continue
        params = {node.get("name"): node.text or "" for node in field.find(NS + "parameters")}
        formula = params["Formula"]
        match = re.fullmatch(r"=(SUM|AVG)\(([^():]+):([^():]+)\)", formula)
        if not match:
            raise ValueError("UnsupportedOracleFormula: " + formula)
        cell = ancestor(field, "tc")
        table = ancestor(cell, "tbl")
        current = address(cell)
        first, last = reference(match[2], current), reference(match[3], current)
        if first[0] > last[0] or first[1] > last[1]:
            raise ValueError("ReversedOracleRange")
        cells = {address(c): c for tr in table.findall(NS + "tr") for c in tr.findall(NS + "tc")}
        operands = []
        for row in range(first[1], last[1] + 1):
            for col in range(first[0], last[0] + 1):
                if (col, row) == current:
                    raise ValueError("CircularOracleReference")
                value = text(cells[(col, row)]).strip().replace(",", "")
                operands.append(decimal.Decimal(value))
        result = sum(operands, decimal.Decimal(0))
        if match[1] == "AVG":
            result /= len(operands)
        cached = decimal.Decimal(params["LastResult"].replace(",", ""))
        if result != cached:
            raise ValueError(f"OracleCachedResultMismatch: {formula}: {result} != {cached}")
        if decimal.Decimal(text(cell).strip().replace(",", "")) != cached:
            raise ValueError("OracleDisplayedResultMismatch")
        rows.append(dict(formula=formula, current=current, first=first, last=last,
                         operands=[str(v) for v in operands], result=str(result),
                         cached=params["LastResult"], resultFormat=params["ResultFormat"]))
    if not rows:
        raise ValueError("EmptyOracleFormulaInventory")
    return rows


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--structure-inventory":
        print(json.dumps(structure_inventory(sys.argv[2]), ensure_ascii=False))
    elif len(sys.argv) == 2:
        print(json.dumps(inspect(sys.argv[1]), ensure_ascii=False))
    else:
        raise ValueError("ExpectedOneFixturePath")
