"""Observed ladder SUM graph; independent Decimal and whole-package expectation."""
import base64
import copy
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path
import re
import runpy
import sys
import xml.etree.ElementTree as E
import zipfile

shared = runpy.run_path(str(Path(__file__).with_name("hwpx-chart-numeric-input-oracle.py")))
package_checks = runpy.run_path(str(Path(__file__).with_name("hwpx_numeric_package.py")))
parse = package_checks["parse"]
P = shared["P"]
require = shared["require"]
SOURCE = "6adca8d39bdcf51e8791d8afa1e584b9570eb8b15df901e74ce61cfd500cdb4a"
PART = "Contents/section0.xml"


def layout(root):
    parents = {child: parent for parent in root.iter() for child in parent}
    paragraphs = {node: index + 1 for index, node in enumerate(root.iter(P + "p"))}

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
    require(len(fields) == 14, "Observed fourteen ladder results")
    table = ancestor(fields[0], "tbl")
    cells = {}
    for row in table.findall(P + "tr"):
        for cell in row.findall(P + "tc"):
            key = address(cell)
            require(key not in cells, "Duplicate source cell")
            cells[key] = cell
    results = {}
    operands = set()
    for ordinal, field in enumerate(fields):
        require(ancestor(field, "tbl") is table, "Observed one ladder table")
        cell = ancestor(field, "tc")
        key = address(cell)
        require(key == (4 if ordinal % 2 == 0 else 6, 2 + ordinal // 2), "Observed ladder result order")
        require(cell.find(P + "cellSpan").attrib == {"colSpan": "1", "rowSpan": "1"}, "Unmerged result cell")
        params = {node.get("name"): node for node in field.find(P + "parameters")}
        expression = params["Formula"].text
        require(expression == ("=SUM(B?:D?)" if ordinal % 2 == 0 else "=SUM(E?:F?)"), "Observed ladder formula")
        require(params["ResultFormat"].text == "%g,", "Observed ladder result format")
        match = re.fullmatch(r"=SUM\(([^():]+):([^():]+)\)", expression)
        first, last = [shared["arithmetic"].reference(match[index], key) for index in (1, 2)]
        points = [(column, row) for row in range(first[1], last[1] + 1) for column in range(first[0], last[0] + 1)]
        require(all(point in cells and point != key for point in points), "Observed source operand domain")
        results[key] = (ordinal, field, params, points)
        operands.update(points)
    targets = {}
    for key in operands - results.keys():
        cell = cells[key]
        require(cell.find(P + "cellSpan").attrib == {"colSpan": "1", "rowSpan": "1"}, "Unmerged numeric operand")
        rows = cell.findall(P + "subList/" + P + "p")
        texts = cell.findall(P + "subList/" + P + "p/" + P + "run/" + P + "t")
        require(len(rows) == 1 and len(texts) == 1 and len(texts[0]) == 0, "Observed scalar input")
        paragraph = paragraphs[rows[0]]
        require(paragraph not in targets, "Duplicate source input paragraph")
        Decimal((texts[0].text or "").replace(",", ""))
        targets[paragraph] = (key, texts[0])
    require(len(targets) == 28, "Observed twenty-eight numeric inputs")
    return targets, results


def calculate(targets, results):
    values = {key: Decimal((text.text or "").replace(",", "")) for key, text in targets.values()}
    active = set()

    def value(key):
        if key in values:
            return values[key]
        require(key in results and key not in active, "Missing or cyclic source dependency")
        active.add(key)
        values[key] = sum((value(point) for point in results[key][3]), Decimal(0))
        active.remove(key)
        return values[key]

    return {key: value(key) for key in results}


def inventory(raw):
    require(hashlib.sha256(raw).hexdigest() == SOURCE, "Observed ladder source bytes")
    with zipfile.ZipFile(io.BytesIO(raw)) as package:
        targets, _ = layout(parse(package.read(PART)))
    return [{"paragraph": paragraph, "text": text.text} for paragraph, (_, text) in sorted(targets.items())]


def verify(data):
    before, after = [base64.b64decode(data[key], validate=True) for key in ("before", "after")]
    require(hashlib.sha256(before).hexdigest() == SOURCE, "Observed ladder source bytes")
    require(type(data["paragraph"]) is int and data["text"] in ("1", "2"), "Explicit ladder input")
    with package_checks["expectation"](before, after, PART) as (expected, actual):
        targets, results = layout(expected)
        original = calculate(targets, results)
        for key, (ordinal, _, params, _) in results.items():
            rendered = shared["formatted"](original[key], "%g,")
            require(params["LastResult"].text == rendered, "Original ladder cache")
            require(params["Command"].text == params["Formula"].text + "??%g,;;" + rendered, "Original ladder command")
            require(shared["manual"].selected(expected, ordinal)[1].text == rendered, "Original ladder display")
        require(data["paragraph"] in targets, "Observed numeric input identity")
        _, text = targets[data["paragraph"]]
        require(Decimal(text.text.replace(",", "")) != Decimal(data["text"]), "Non-noop numeric input")
        text.text = data["text"]
        changed = calculate(targets, results)
        affected = []
        for key, (ordinal, field, params, _) in results.items():
            if changed[key] == original[key]:
                continue
            rendered = shared["formatted"](changed[key], "%g,")
            params["LastResult"].text = rendered
            params["Command"].text = params["Formula"].text + "??%g,;;" + rendered
            field.set("dirty", "1")
            shared["manual"].selected(expected, ordinal)[1].text = rendered
            affected.append(ordinal)
        require(len(affected) in (1, 2), "Observed direct and downstream result count")
        require(shared["prefix"].signature(expected) == shared["prefix"].signature(actual), "Complete cascaded SUM XML mismatch")
    return {"inputs": 28, "formulas": 14, "affected": affected}


def self_test(data):
    verify(data)

    def mutant(kind):
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(data["after"]))) as source, zipfile.ZipFile(output, "w") as target:
            target.comment = source.comment
            for original in source.infolist():
                entry = copy.copy(original)
                payload = source.read(original)
                if entry.filename == PART:
                    root = parse(payload)
                    fields = [node for node in root.iter(P + "fieldBegin") if node.get("type") == "FORMULA"]
                    if kind == "input":
                        list(root.iter(P + "p"))[data["paragraph"] - 1].find(P + "run/" + P + "t").text = "999"
                    elif kind in ("direct", "downstream"):
                        shared["manual"].selected(root, 0 if kind == "direct" else 1)[1].text = "wrong"
                    elif kind in ("cache", "command"):
                        params = {node.get("name"): node for node in fields[0].find(P + "parameters")}
                        params["LastResult" if kind == "cache" else "Command"].text = "wrong"
                    elif kind == "dirty":
                        fields[0].set("dirty", "0")
                    payload = E.tostring(root)
                elif entry.filename == "Contents/header.xml":
                    if kind == "payload": payload += b"wrong"
                    if kind == "metadata": entry.comment = b"wrong"
                target.writestr(entry, payload)
        return {**data, "after": base64.b64encode(output.getvalue()).decode()}

    verify(mutant(None))
    for kind in ("input", "direct", "downstream", "cache", "command", "dirty", "payload", "metadata"):
        try:
            verify(mutant(kind))
        except ValueError:
            continue
        raise ValueError("Cascaded SUM oracle accepted mutation: " + kind)
    return 8


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--inventory":
        print(json.dumps(inventory(Path(sys.argv[2]).read_bytes())))
    else:
        require(len(sys.argv) == 1, "Unexpected cascaded SUM oracle argument")
        request = json.load(sys.stdin)
        result = verify(request)
        if request.get("selfTest"):
            result["rejectedMutants"] = self_test(request)
        print(json.dumps(result))
