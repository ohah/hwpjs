"""Pinned multi-table SUM/ABOVE source; independent operands, not product output."""
import base64
import copy
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
import xml.etree.ElementTree as E
import zipfile

numeric = runpy.run_path(str(Path(__file__).with_name("hwpx-chart-numeric-input-oracle.py")))
package_checks = runpy.run_path(str(Path(__file__).with_name("hwpx_numeric_package.py")))
parse = package_checks["parse"]
P, require = numeric["P"], numeric["require"]
SOURCE = "e7b147f7cea66c97bed79085a3d89c2656037e0f711232f659ed3c7344984f62"
PART = "Contents/section0.xml"


def layout(root):
    parents = {child: parent for parent in root.iter() for child in parent}
    paragraphs = {node: index + 1 for index, node in enumerate(root.iter(P + "p"))}
    tables = list(root.iter(P + "tbl"))

    def ancestor(node, tag):
        while node.tag != P + tag:
            require(node in parents, "Missing source ancestor")
            node = parents[node]
        return node

    def address(cell):
        node = cell.find(P + "cellAddr")
        require(node is not None, "Missing source cell address")
        return int(node.get("colAddr")), int(node.get("rowAddr"))

    fields = [node for node in root.iter(P + "fieldBegin") if node.get("type") == "FORMULA"]
    require(len(fields) == 3 and len(tables) == 55, "Observed nested source inventory")
    targets, results = {}, []
    for ordinal, field in enumerate(fields):
        table = ancestor(field, "tbl")
        require(tables.index(table) == (37, 39, 48)[ordinal], "Observed independent table identity")
        key = address(ancestor(field, "tc"))
        require(key == ((7, 2), (6, 11), (7, 2))[ordinal], "Observed result address")
        params = {node.get("name"): node for node in field.find(P + "parameters")}
        expression = "=SUM(ABOVE)" if ordinal == 1 else "=SUM(B?:G?)"
        require(params["Formula"].text == expression and params["ResultFormat"].text == "%g,", "Observed SUM definition")
        cells = {}
        for row in table.findall(P + "tr"):
            for cell in row.findall(P + "tc"):
                point = address(cell)
                require(point not in cells, "Duplicate source cell")
                cells[point] = cell
        # ABOVE's contiguous numeric tail stops at the two-paragraph header.
        # The numeric value BELOW the result must not join its operands.
        points = [(6, row) for row in range(1, 11)] if ordinal == 1 else [(column, 2) for column in range(1, 7)]
        if ordinal == 1:
            header = cells[(6, 0)].findall(P + "subList/" + P + "p")
            require(len(header) == 2 and [p.find(P + "run/" + P + "t").text for p in header] == ["현재가치", "(E=C*D, 백만 원)"], "Observed ABOVE stop boundary")
            require(cells[(6, 12)].find(P + "subList/" + P + "p/" + P + "run/" + P + "t").text == "2.48", "Observed excluded below result")
        operands = []
        for point in points:
            cell = cells[point]
            require(cell.find(P + "cellSpan").attrib == {"colSpan": "1", "rowSpan": "1"}, "Unmerged source operand")
            rows = cell.findall(P + "subList/" + P + "p")
            texts = cell.findall(P + "subList/" + P + "p/" + P + "run/" + P + "t")
            require(len(rows) == 1 and len(texts) == 1 and len(texts[0]) == 0, "Observed scalar source input")
            paragraph, text = paragraphs[rows[0]], texts[0]
            Decimal(text.text.replace(",", ""))
            require(paragraph not in targets, "Unique source input")
            targets[paragraph] = (ordinal, text)
            operands.append(text)
        results.append((field, params, operands))
    require(len(targets) == 22, "Observed twenty-two numeric inputs")
    return targets, results


def inventory(raw):
    require(hashlib.sha256(raw).hexdigest() == SOURCE, "Observed nested SUM source bytes")
    with zipfile.ZipFile(io.BytesIO(raw)) as package:
        targets, _ = layout(parse(package.read(PART)))
    return [{"paragraph": paragraph, "text": text.text, "ordinal": ordinal} for paragraph, (ordinal, text) in sorted(targets.items())]


def verify(data):
    before, after = [base64.b64decode(data[key], validate=True) for key in ("before", "after")]
    require(hashlib.sha256(before).hexdigest() == SOURCE, "Observed nested SUM source bytes")
    require(type(data["paragraph"]) is int and data["text"] == "1", "Explicit nested SUM input")
    with package_checks["expectation"](before, after, PART) as (expected, actual):
        targets, results = layout(expected)
        for ordinal, (_, params, operands) in enumerate(results):
            rendered = numeric["formatted"](sum((Decimal(text.text.replace(",", "")) for text in operands), Decimal(0)), "%g,")
            require(params["LastResult"].text == rendered, "Original nested SUM cache")
            require(params["Command"].text == params["Formula"].text + "??%g,;;" + rendered, "Original nested SUM command")
            require(numeric["manual"].selected(expected, ordinal)[1].text == rendered, "Original nested SUM display")
        require(data["paragraph"] in targets, "Observed numeric input identity")
        ordinal, text = targets[data["paragraph"]]
        require(Decimal(text.text.replace(",", "")) != 1, "Non-noop numeric input")
        text.text = "1"
        field, params, operands = results[ordinal]
        rendered = numeric["formatted"](sum((Decimal(text.text.replace(",", "")) for text in operands), Decimal(0)), "%g,")
        params["LastResult"].text = rendered
        params["Command"].text = params["Formula"].text + "??%g,;;" + rendered
        field.set("dirty", "1")
        numeric["manual"].selected(expected, ordinal)[1].text = rendered
        require(numeric["prefix"].signature(expected) == numeric["prefix"].signature(actual), "Complete nested SUM XML mismatch")
    return {"inputs": 22, "formulas": 3, "affected": [ordinal]}


def self_test(data):
    result = verify(data)

    def mutant(kind):
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(data["after"]))) as source, zipfile.ZipFile(output, "w") as target:
            target.comment = source.comment
            for original in source.infolist():
                entry, payload = copy.copy(original), source.read(original)
                if entry.filename == PART:
                    root = parse(payload)
                    targets, results = layout(root)
                    ordinal = result["affected"][0]
                    field, params, _ = results[ordinal]
                    if kind == "input": targets[data["paragraph"]][1].text = "999"
                    elif kind == "result": numeric["manual"].selected(root, ordinal)[1].text = "wrong"
                    elif kind == "other-table": numeric["manual"].selected(root, (ordinal + 1) % 3)[1].text = "wrong"
                    elif kind == "cache": params["LastResult"].text = "wrong"
                    elif kind == "command": params["Command"].text = "wrong"
                    elif kind == "dirty": field.set("dirty", "0")
                    elif kind == "below": list(root.iter(P + "p"))[978].find(P + "run/" + P + "t").text = "wrong"
                    payload = E.tostring(root)
                elif entry.filename == "Contents/header.xml":
                    if kind == "payload": payload += b"wrong"
                    if kind == "metadata": entry.comment = b"wrong"
                target.writestr(entry, payload)
        return {**data, "after": base64.b64encode(output.getvalue()).decode()}

    verify(mutant(None))
    kinds = ("input", "result", "other-table", "cache", "command", "dirty", "below", "payload", "metadata")
    for kind in kinds:
        try:
            verify(mutant(kind))
        except ValueError as error:
            expected = "ZIP metadata" if kind == "metadata" else "Non-target payload" if kind == "payload" else "Complete nested SUM XML mismatch"
            require(str(error) == expected, "Unexpected nested SUM mutation rejection: " + kind + ": " + str(error))
            continue
        raise ValueError("Nested SUM oracle accepted mutation: " + kind)
    return len(kinds)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--inventory":
        print(json.dumps(inventory(Path(sys.argv[2]).read_bytes())))
    else:
        require(len(sys.argv) == 1, "Unexpected nested SUM oracle argument")
        request = json.load(sys.stdin)
        result = verify(request)
        if request.get("selfTest"):
            result["rejectedMutants"] = self_test(request)
        print(json.dumps(result))
