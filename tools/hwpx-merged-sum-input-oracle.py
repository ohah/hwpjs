"""Pinned merged-table SUM witness; no general nonnumeric-cell fallback."""
import base64
import copy
from decimal import Decimal
import hashlib
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as E
from pathlib import Path
import runpy

numeric = runpy.run_path(str(Path(__file__).with_name("hwpx-chart-numeric-input-oracle.py")))
P = numeric["P"]
require = numeric["require"]
SOURCE = "ce9f7275b9c84e4f032c218b9b6f94cf53c24f6e91fba30be7fd55b17acee924"


def parse(raw):
    require(b"<!DOCTYPE" not in raw and b"<!ENTITY" not in raw, "Unsupported declaration")
    return E.fromstring(raw, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))


def layout(root):
    parents = {child: parent for parent in root.iter() for child in parent}
    paragraphs = {node: i + 1 for i, node in enumerate(root.iter(P + "p"))}
    def ancestor(node, kind):
        while node.tag != P + kind:
            require(node in parents, "Missing source ancestor")
            node = parents[node]
        return node
    fields = [node for node in root.iter(P + "fieldBegin") if node.get("type") == "FORMULA"]
    require(len(fields) == 5, "Observed five SUM fields")
    table = ancestor(fields[0], "tbl")
    cells = {}
    for row in table.findall(P + "tr"):
        for cell in row.findall(P + "tc"):
            addr = cell.find(P + "cellAddr")
            key = (int(addr.get("colAddr")), int(addr.get("rowAddr")))
            require(key not in cells, "Duplicate source cell")
            cells[key] = cell
    def leaf(cell):
        rows = cell.findall(P + "subList/" + P + "p")
        texts = cell.findall(P + "subList/" + P + "p/" + P + "run/" + P + "t")
        require(len(rows) == 1 and len(texts) == 1 and len(texts[0]) == 0, "Observed scalar source cell")
        return paragraphs[rows[0]], texts[0]
    for row, description in [(4, "공용면적에 포함"), (5, "환자 이용공간이 아니므로 제외함")]:
        cell = cells[(2, row)]
        require(cell.find(P + "cellSpan").attrib == {"colSpan": "6", "rowSpan": "1"}, "Observed description span")
        require(leaf(cell)[1].text == description, "Observed merged description")
    targets, results = {}, []
    for ordinal, field in enumerate(fields):
        require(ancestor(field, "tbl") is table, "One observed SUM table")
        cell = ancestor(field, "tc"); addr = cell.find(P + "cellAddr")
        column = int(addr.get("colAddr"))
        require(column == ordinal + 2 and addr.get("rowAddr") == "7", "Observed result address")
        params = {node.get("name"): node for node in field.find(P + "parameters")}
        require(params["Formula"].text == "=SUM(?3:?7)" and params["ResultFormat"].text == "%g,", "Observed SUM definition")
        operands = []
        for row in (2, 3, 6):
            source = cells[(column, row)]
            require(source.find(P + "cellSpan").attrib == {"colSpan": "1", "rowSpan": "1"}, "Unmerged numeric source")
            paragraph, text = leaf(source)
            Decimal(text.text)
            require(paragraph not in targets, "Unique numeric target")
            targets[paragraph] = text
            operands.append(text)
        results.append((ordinal, field, params, operands))
    require(len(targets) == 15, "Observed fifteen numeric inputs")
    return targets, results


def archive(raw):
    require(hashlib.sha256(raw).hexdigest() == SOURCE, "Observed merged SUM source bytes")
    return zipfile.ZipFile(io.BytesIO(raw))


def inventory(raw):
    with archive(raw) as package:
        targets, _ = layout(parse(package.read("Contents/section0.xml")))
        return [{"paragraph": paragraph, "text": text.text} for paragraph, text in sorted(targets.items())]


def verify(data):
    before, after = [base64.b64decode(data[key], validate=True) for key in ("before", "after")]
    require(type(data["paragraph"]) is int and data["text"] == "1", "Explicit numeric replacement")
    with archive(before) as old, zipfile.ZipFile(io.BytesIO(after)) as new:
        require(old.namelist() == new.namelist() and len(set(old.namelist())) == len(old.namelist()) and old.comment == new.comment, "ZIP inventory")
        require(old.testzip() is None and new.testzip() is None, "ZIP integrity")
        for entry in old.infolist():
            current = new.getinfo(entry.filename)
            for key in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                require(getattr(entry, key) == getattr(current, key), "ZIP metadata")
            if entry.filename != "Contents/section0.xml":
                require(old.read(entry) == new.read(entry.filename), "Non-target payload")
        expected = parse(old.read("Contents/section0.xml"))
        targets, results = layout(expected)
        require(data["paragraph"] in targets, "Observed numeric target")
        selected = targets[data["paragraph"]]
        require(Decimal(selected.text) != 1, "Non-noop numeric replacement")
        # Validate all original caches before computing one dependency change.
        for ordinal, field, params, operands in results:
            value = numeric["formatted"](sum((Decimal(node.text) for node in operands), Decimal(0)), "%g,")
            require(params["LastResult"].text == value and params["Command"].text == params["Formula"].text + "??%g,;;" + value, "Original SUM cache")
            require(numeric["manual"].selected(expected, ordinal)[1].text == value, "Original SUM display")
        selected.text = "1"
        changed = 0
        for ordinal, field, params, operands in results:
            if selected not in operands:
                continue
            value = numeric["formatted"](sum((Decimal(node.text) for node in operands), Decimal(0)), "%g,")
            params["LastResult"].text = value
            params["Command"].text = params["Formula"].text + "??%g,;;" + value
            field.set("dirty", "1")
            numeric["manual"].selected(expected, ordinal)[1].text = value
            changed += 1
        require(changed == 1, "One dependent SUM result")
        actual = parse(new.read("Contents/section0.xml"))
        require(numeric["prefix"].signature(expected) == numeric["prefix"].signature(actual), "Complete merged SUM XML mismatch")


def self_test(data):
    def mutate(kind):
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(data["after"]))) as source, zipfile.ZipFile(output, "w") as target:
            target.comment = b"wrong" if kind == "zip" else source.comment
            for entry in source.infolist():
                payload = source.read(entry.filename)
                if entry.filename == "Contents/section0.xml":
                    root = parse(payload); inputs, results = layout(root)
                    if kind == "input": inputs[data["paragraph"]].text = "2"
                    elif kind == "cache": results[0][2]["LastResult"].text = "wrong"
                    elif kind == "description":
                        node = next(n for n in root.iter(P + "t") if n.text == "공용면적에 포함"); node.text = "wrong"
                    elif kind == "style": next(root.iter(P + "run")).set("charPrIDRef", "4294967295")
                    payload = E.tostring(root)
                elif kind == "payload" and entry.filename == "Contents/header.xml": payload += b"wrong"
                target.writestr(copy.copy(entry), payload)
        return {**data, "after": base64.b64encode(output.getvalue()).decode()}
    verify(mutate(None))
    for kind in ("input", "cache", "description", "style", "payload", "zip"):
        try: verify(mutate(kind))
        except ValueError: continue
        raise ValueError("Merged SUM oracle accepted mutation: " + kind)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--inventory":
        print(json.dumps(inventory(Path(sys.argv[2]).read_bytes())))
    else:
        data = json.load(sys.stdin); verify(data)
        if data.get("selfTest"): self_test(data)
        print("Independent merged SUM full XML ZIP verified" + ("; 6 mutations rejected" if data.get("selfTest") else ""))
