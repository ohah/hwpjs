"""Independent XML preservation and numeric-input oracle for chart definitions."""
import base64
import io
import json
import math
import re
import sys
import zipfile
import xml.etree.ElementTree as ET


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check(request):
    before = zipfile.ZipFile(io.BytesIO(base64.b64decode(request["before"])))
    after = zipfile.ZipFile(io.BytesIO(base64.b64decode(request["after"])))
    part = "Contents/section0.xml"
    require(set(before.namelist()) == set(after.namelist()), "ZIP names")
    for name in before.namelist():
        if name != part:
            require(before.read(name) == after.read(name), "non-section bytes")
    p = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
    old = ET.fromstring(before.read(part))
    new = ET.fromstring(after.read(part))
    parents = {child: parent for parent in old.iter() for child in parent}
    fields = [node for node in old.iter(p + "fieldBegin") if node.get("type") == "FORMULA"]
    target = fields[request["ordinal"]]
    cell = parents[target]
    while cell.tag != p + "tc":
        cell = parents[cell]
    table = parents[cell]
    while table.tag != p + "tbl":
        table = parents[table]
    address = cell.find(p + "cellAddr")
    origin = (int(address.get("colAddr")), int(address.get("rowAddr")))
    formula = request["formula"]
    if "B?:E?" in formula:
        coordinates = [(column, origin[1]) for column in range(1, 5)]
    elif "?2:?4" in formula:
        coordinates = [(origin[0], row) for row in range(1, 4)]
    elif re.fullmatch(r"=(SUM|AVG|PRODUCT|MIN|MAX)\(([A-Z]+|\?)([1-9][0-9]*|\?)(,([A-Z]+|\?)([1-9][0-9]*|\?))*\)", formula):
        coordinates = []
        for token in formula[formula.index("(") + 1:-1].split(","):
            column_text, row_text = re.fullmatch(r"([A-Z]+|\?)([1-9][0-9]*|\?)", token).groups()
            column = 0
            for letter in column_text:
                if letter != "?":
                    column = column * 26 + ord(letter) - ord("A") + 1
            coordinates.append((origin[0] if column_text == "?" else column - 1,
                                origin[1] if row_text == "?" else int(row_text) - 1))
    else:
        raise ValueError("uncovered formula range")
    numbers = {}
    for row in table.findall(p + "tr"):
        for entry in row.findall(p + "tc"):
            addr = entry.find(p + "cellAddr")
            key = (int(addr.get("colAddr")), int(addr.get("rowAddr")))
            if key not in coordinates:
                continue
            require(not list(entry.iter(p + "fieldBegin")), "derived input not supported")
            text = "".join(node.text or "" for node in entry.iter(p + "t"))
            numbers[key] = float(text.replace(",", "").strip())
    require(set(numbers) == set(coordinates), "missing input cell")
    values = [numbers[coordinate] for coordinate in coordinates]
    expected = min(values) if formula.startswith("=MIN(") else max(values) if formula.startswith("=MAX(") else math.prod(values) if formula.startswith("=PRODUCT(") else sum(values)
    if formula.startswith("=AVG("):
        expected /= len(coordinates)
    old_nodes, new_nodes = list(old.iter()), list(new.iter())
    require(len(old_nodes) == len(new_nodes), "element count")
    position = old_nodes.index(target)
    result_nodes = []
    for node in old_nodes[position + len(list(target.iter())):]:
        if node.tag == p + "fieldEnd":
            require(node.get("beginIDRef") == target.get("id"), "field pairing")
            break
        if node.tag == p + "t":
            result_nodes.append(node)
    require(len(result_nodes) == 1, "uncovered result structure")
    updated = new_nodes[position]
    values = {node.get("name"): node.text for node in updated.iter(p + "stringParam")}
    require(values["Formula"] == formula, "definition")
    display = values["LastResult"]
    if values["ResultFormat"] == "%g,":
        require(display == format(expected, ",.6g"), "general six-digit calculation")
    else:
        require(math.isclose(float(display.replace(",", "")), expected, rel_tol=1e-10, abs_tol=0.005), "calculation")
    require(values["Command"] == formula + "??" + values["ResultFormat"] + ";;" + display, "command cache")
    changed = 0
    for left, right in zip(old_nodes, new_nodes):
        require(left.tag == right.tag and left.tail == right.tail, "tree structure")
        if left.attrib != right.attrib:
            require(left is target and right.get("dirty") == "1", "foreign attribute")
            require({k: v for k, v in left.attrib.items() if k != "dirty"} == {k: v for k, v in right.attrib.items() if k != "dirty"}, "field attributes")
        if left.text != right.text:
            require((left in list(target.iter(p + "stringParam")) and left.get("name") in ("Command", "Formula", "LastResult")) or (left is result_nodes[0] and right.text == display), "foreign text")
            changed += 1
    require(changed == 4, "expected four text changes")
    return {"expected": expected, "display": display}


if __name__ == "__main__":
    print(json.dumps(check(json.load(sys.stdin))))
