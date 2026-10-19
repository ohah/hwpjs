"""Pinned BELOW inputs: first numeric paragraph, literal suffix and other-table preservation."""
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
SOURCE = "fa00fae4aec5f80175898734ea4d06b82f4c80df7e32b69a7370328c770ab60f"
PART = "Contents/section0.xml"


def rendered(value):
    # This observed source has exact grouped integers, including seven positions.
    # Its fractional totals stay inside the existing bounded Decimal spelling.
    require(value.is_finite() and abs(value) < 2000000, "Observed BELOW numeric domain")
    return format(int(value), ",") if value == value.to_integral_value() else numeric["formatted"](value, "%g,")


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
    require(len(fields) == 5 and len(tables) == 20, "Observed BELOW source inventory")
    targets, results = {}, []
    for ordinal, field in enumerate(fields):
        table = ancestor(field, "tbl")
        require(tables.index(table) == (4, 14, 14, 15, 15)[ordinal], "Observed BELOW table identity")
        column, first, last = ((3, 3, 10), (1, 3, 12), (2, 3, 12), (1, 3, 13), (2, 3, 13))[ordinal]
        require(address(ancestor(field, "tc")) == (column, 2), "Observed BELOW result address")
        params = {node.get("name"): node for node in field.find(P + "parameters")}
        require(params["Formula"].text == "=SUM(BELOW)" and params["ResultFormat"].text == "%g,", "Observed BELOW definition")
        cells = {}
        for row in table.findall(P + "tr"):
            for cell in row.findall(P + "tc"):
                key = address(cell)
                require(key not in cells, "Duplicate source cell")
                cells[key] = cell
        require(int(table.get("rowCnt")) == last + 1, "Observed table bottom boundary")
        operands = []
        for row in range(first, last + 1):
            cell = cells[(column, row)]
            require(cell.find(P + "cellSpan").attrib == {"colSpan": "1", "rowSpan": "1"}, "Unmerged BELOW operand")
            rows = cell.findall(P + "subList/" + P + "p")
            require(len(rows) == (1 if ordinal == 0 else 2), "Observed operand paragraph count")
            leaves = rows[0].findall(P + "run/" + P + "t")
            require(len(leaves) == 1 and not len(leaves[0]), "Observed first numeric leaf")
            text, paragraph = leaves[0], paragraphs[rows[0]]
            Decimal(text.text.replace(",", ""))
            note = None
            if ordinal:
                notes = rows[1].findall(P + "run/" + P + "t")
                require(len(notes) == 1 and not len(notes[0]) and notes[0].text.startswith("(") and notes[0].text.endswith(")"), "Observed separate percentage note")
                note = paragraphs[rows[1]]
            require(paragraph not in targets, "Unique BELOW numeric input")
            targets[paragraph] = (ordinal, text, note)
            operands.append(text)
        results.append((field, params, operands))
    require(len(targets) == 50, "Observed fifty BELOW inputs")
    return targets, results


def inventory(raw):
    require(hashlib.sha256(raw).hexdigest() == SOURCE, "Observed BELOW source bytes")
    with zipfile.ZipFile(io.BytesIO(raw)) as package:
        targets, _ = layout(parse(package.read(PART)))
    return [{"paragraph": paragraph, "text": text.text, "ordinal": ordinal, "note": note} for paragraph, (ordinal, text, note) in sorted(targets.items())]


def verify(data):
    before, after = [base64.b64decode(data[key], validate=True) for key in ("before", "after")]
    require(hashlib.sha256(before).hexdigest() == SOURCE, "Observed BELOW source bytes")
    require(type(data["paragraph"]) is int and data["text"] == "1", "Explicit BELOW input")
    with package_checks["expectation"](before, after, PART) as (expected, actual):
        targets, results = layout(expected)
        for ordinal, (_, params, operands) in enumerate(results):
            value = rendered(sum((Decimal(text.text.replace(",", "")) for text in operands), Decimal(0)))
            require(params["LastResult"].text == value, "Original BELOW cache")
            require(params["Command"].text == "=SUM(BELOW)??%g,;;" + value, "Original BELOW command")
            # Ordinal 0 is a manual/stale display, with a separate literal suffix.
            require(numeric["manual"].selected(expected, ordinal)[1].text == ("100" if ordinal == 0 else value), "Observed original BELOW display")
        suffix = list(expected.iter(P + "p"))[82].findall(P + "run/" + P + "t")
        require(len(suffix) == 2 and suffix[1].text == ".0", "Observed outside-field suffix")
        require(data["paragraph"] in targets, "Observed BELOW input identity")
        ordinal, text, _ = targets[data["paragraph"]]
        require(Decimal(text.text.replace(",", "")) != 1, "Non-noop BELOW input")
        text.text = "1"
        field, params, operands = results[ordinal]
        value = rendered(sum((Decimal(text.text.replace(",", "")) for text in operands), Decimal(0)))
        params["LastResult"].text = value
        params["Command"].text = "=SUM(BELOW)??%g,;;" + value
        field.set("dirty", "1")
        numeric["manual"].selected(expected, ordinal)[1].text = value
        require(numeric["prefix"].signature(expected) == numeric["prefix"].signature(actual), "Complete BELOW SUM XML mismatch")
    return {"inputs": 50, "formulas": 5, "affected": [ordinal]}


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
                    elif kind == "other-formula": numeric["manual"].selected(root, (ordinal + 1) % 5)[1].text = "wrong"
                    elif kind == "cache": params["LastResult"].text = "wrong"
                    elif kind == "command": params["Command"].text = "wrong"
                    elif kind == "dirty": field.set("dirty", "0")
                    elif kind == "suffix": list(root.iter(P + "p"))[82].findall(P + "run/" + P + "t")[1].text = "wrong"
                    elif kind == "note": list(root.iter(P + "p"))[548].find(P + "run/" + P + "t").text = "(wrong)"
                    payload = E.tostring(root)
                elif entry.filename == "Contents/header.xml":
                    if kind == "payload": payload += b"wrong"
                    if kind == "metadata": entry.comment = b"wrong"
                target.writestr(entry, payload)
        return {**data, "after": base64.b64encode(output.getvalue()).decode()}

    verify(mutant(None))
    kinds = ("input", "result", "other-formula", "cache", "command", "dirty", "suffix", "note", "payload", "metadata")
    for kind in kinds:
        try:
            verify(mutant(kind))
        except ValueError as error:
            expected = "ZIP metadata" if kind == "metadata" else "Non-target payload" if kind == "payload" else "Complete BELOW SUM XML mismatch"
            require(str(error) == expected, "Unexpected BELOW mutation rejection: " + kind + ": " + str(error))
            continue
        raise ValueError("BELOW oracle accepted mutation: " + kind)
    return len(kinds)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--inventory":
        print(json.dumps(inventory(Path(sys.argv[2]).read_bytes())))
    else:
        require(len(sys.argv) == 1, "Unexpected BELOW oracle argument")
        request = json.load(sys.stdin)
        result = verify(request)
        if request.get("selfTest"):
            result["rejectedMutants"] = self_test(request)
        print(json.dumps(result))
