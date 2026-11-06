"""Independent ZIP/XML byte oracle; stdlib only, never loads product XML code."""
import base64
import copy
import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from xml.parsers import expat

LIMIT = 128 * 1024 * 1024
HEAD = "http://www.hancom.co.kr/hwpml/2011/head"
PARA = "http://www.hancom.co.kr/hwpml/2011/paragraph"
CORE = "http://www.hancom.co.kr/hwpml/2011/core"
VERSION = "http://www.hancom.co.kr/hwpml/2011/version"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def swap(n):
    return ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)


def archive(encoded):
    raw = base64.b64decode(encoded, validate=True)
    require(len(raw) <= LIMIT, "ZIP input budget")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        items = z.infolist()
        require(len(items) <= 4096, "ZIP entry budget")
        require(sum(x.file_size for x in items) <= LIMIT, "ZIP decoded budget")
        names = [x.filename for x in items]
        require(len(set(names)) == len(names), "duplicate ZIP entry")
        require(all(not x.flag_bits & 1 for x in items), "encrypted ZIP entry")
        return {x.filename: z.read(x) for x in items}


def tag_end(raw, start):
    quote = None
    for i in range(start, len(raw)):
        c = raw[i]
        if quote is not None:
            if c == quote:
                quote = None
        elif c in (34, 39):
            quote = c
        elif c == 62:
            return i + 1
    raise ValueError("unterminated XML tag")


def parse(raw):
    require(len(raw) <= LIMIT, "XML budget")
    p = expat.ParserCreate(namespace_separator="}")
    nodes, stack = [], []

    def start(name, attrs):
        i = p.CurrentByteIndex
        end = tag_end(raw, i)
        node = {"name": name, "start": i, "tagEnd": end,
                "selfClosing": raw[i:end].rstrip().endswith(b"/>"),
                "parent": stack[-1] if stack else None}
        nodes.append(node)
        require(len(nodes) <= 1_000_000, "XML node budget")
        stack.append(len(nodes) - 1)

    def end(name):
        node = nodes[stack.pop()]
        node["closeStart"] = node["tagEnd"] if node["selfClosing"] else p.CurrentByteIndex
        node["end"] = node["tagEnd"] if node["selfClosing"] else tag_end(raw, p.CurrentByteIndex)

    def dtd(*args):
        raise ValueError("DTD/entity input not admitted")

    p.StartElementHandler = start
    p.EndElementHandler = end
    p.StartDoctypeDeclHandler = dtd
    p.EntityDeclHandler = dtd
    p.ExternalEntityRefHandler = dtd
    p.Parse(raw, True)
    root = ET.fromstring(raw, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))
    elements = [n for n in root.iter() if isinstance(n.tag, str)]
    require(len(nodes) == len(elements), "independent parser element mismatch")
    require(all(n["name"] == e.tag.lstrip("{") for n, e in zip(nodes, elements)), "XML preorder mismatch")
    return {"raw": raw, "root": root, "elements": elements, "nodes": nodes}


def tree(node):
    # Includes opaque namespaced attrs, all whitespace/text/tails, comments and PIs.
    name = node.tag if isinstance(node.tag, str) else repr(node.tag)
    return (name, tuple(sorted(node.attrib.items())), node.text, node.tail,
            tuple(tree(c) for c in node))


def raw_node(part, index):
    n = part["nodes"][index]
    return part["raw"][n["start"]:n["end"]]


def attr_change(part, index, name, value):
    n = part["nodes"][index]
    tag = part["raw"][n["start"]:n["tagEnd"]]
    pattern = rb"(?<![\w:.-])" + re.escape(name.encode()) + rb"\s*=\s*([\"'])(.*?)\1"
    matches = list(re.finditer(pattern, tag, re.DOTALL))
    require(len(matches) == 1, "missing/duplicate raw attribute " + name)
    m = matches[0]
    return (n["start"] + m.start(2), n["start"] + m.end(2), str(value).encode())


def splice(raw, changes):
    out, cursor = [], 0
    for start, end, value in sorted(changes, key=lambda c: c[0]):
        require(start >= cursor and end >= start, "overlapping expectation")
        out += [raw[cursor:start], value]
        cursor = end
    return b"".join(out + [raw[cursor:]])


def profile(entries):
    attrs = parse(entries["version.xml"])["root"]
    require(attrs.tag == "{" + VERSION + "}HCFVersion", "version namespace")
    a = attrs.attrib
    require(all(a.get(k) == v for k, v in {
        "major": "5", "minor": "1", "os": "1",
        # Literal source/schema spelling; do not silently repair this attribute.
        "tagetApplication": "WORDPROCESSOR", "application": "Hancom Office Hangul"
    }.items()) and "patch" not in a and "revision" not in a, "unverified producer identity")
    values = tuple(a.get(k) for k in ("micro", "buildNumber", "xmlVersion", "appVersion"))
    if values == ("0", "1", "1.2", "10, 0, 0, 5060 WIN32LEWindows_8"):
        return "colorref24"
    require(values == ("1", "0", "1.5", "12, 0, 0, 4426 WIN32LEWindows_10"), "unknown producer color encoding")
    return "rgb24"


def hexcolor(text):
    require(isinstance(text, str) and re.fullmatch(r"#[0-9A-Fa-f]{6}", text) is not None,
            "explicit six-digit color required")
    return int(text[1:], 16)


def one(items, message):
    require(len(items) == 1, message)
    return items[0]


def original(encoded, target):
    entries = archive(encoded)
    section_name = "Contents/section%d.xml" % target["section"]
    section, header = parse(entries[section_name]), parse(entries["Contents/header.xml"])
    elements = section["elements"]
    table_i, list_i = target["tableNode"], target["listNode"]
    require(0 <= table_i < len(elements) and 0 <= list_i < len(elements), "selector outside XML elements")
    require(elements[table_i].tag == "{" + PARA + "}tbl", "table selector")
    require(elements[list_i].tag == "{" + PARA + "}subList", "list selector")
    cell_i = section["nodes"][list_i]["parent"]
    require(cell_i is not None and elements[cell_i].tag == "{" + PARA + "}tc", "cell selector")
    row_i = section["nodes"][cell_i]["parent"]
    require(row_i is not None and elements[row_i].tag == "{" + PARA + "}tr" and
            section["nodes"][row_i]["parent"] == table_i, "cell/table ownership")
    cell = elements[cell_i]
    source_ref = int(cell.attrib["borderFillIDRef"])
    container = one([e for e in header["elements"] if e.tag == "{" + HEAD + "}borderFills"], "borderFills count")
    fills = [e for e in container if e.tag == "{" + HEAD + "}borderFill"]
    ids = [int(e.attrib["id"]) for e in fills]
    require(len(ids) == len(set(ids)) and int(container.attrib["itemCnt"]) == len(ids), "BF ids/count")
    source = one([e for e in fills if int(e.attrib["id"]) == source_ref], "source resource")
    brushes = [e for e in source if e.tag == "{" + CORE + "}fillBrush"]
    require(len(brushes) <= 1, "duplicate fillBrush")
    raw_color, source_kind = None, "none"
    if brushes:
        win = one(list(brushes[0]), "single brush child")
        require(win.tag == "{" + CORE + "}winBrush" and "hatchStyle" not in win.attrib, "solid only")
        require("hatchColor" in win.attrib, "original solid cohort has explicit inactive foreground")
        raw_color = hexcolor(win.attrib.get("faceColor"))
        source_kind = "solid"
    encoding = profile(entries)
    require(target.get("colorEncoding") == encoding, "pinned color encoding mismatch")
    next_ref = 0
    while next_ref in ids:
        next_ref += 1
    shared_count = sum(e.tag == "{" + PARA + "}tc" and e.attrib.get("borderFillIDRef") == str(source_ref)
                       for e in elements)
    return {"entries": entries, "sectionName": section_name, "section": section, "header": header,
            "source": source, "container": container, "fills": fills, "cellIndex": cell_i,
            "sourceRef": source_ref, "nextRef": next_ref, "sharedCount": shared_count,
            "resourceCount": len(fills),
            "color": None if raw_color is None else swap(raw_color) if encoding == "colorref24" else raw_color,
            "sourceKind": source_kind, "encoding": encoding}


def public(o):
    from decimal import Decimal
    edges = []
    for name in ("leftBorder", "rightBorder", "topBorder", "bottomBorder"):
        e = one([e for e in o["source"] if e.tag == "{" + HEAD + "}" + name], "source edge")
        raw = hexcolor(e.attrib["color"])
        edges.append({"style": e.attrib["type"], "width": int(Decimal(e.attrib["width"].removesuffix(" mm"))*100),
                      "color": raw})
    return {**{key: o[key] for key in ("sourceRef", "nextRef", "sharedCount", "resourceCount", "color", "sourceKind")}, "edges":edges}


def verify(request):
    target = request["target"]
    o = original(request["before"], target)
    if "after" not in request:
        return public(o)
    operations = request["operations"]
    require(isinstance(operations, list) and 0 < len(operations) <= 32, "operation budget")
    ref = o["nextRef"]
    require(request.get("expectedRef") in (None, ref), "wrong expected clone reference")
    entries = archive(request["after"])
    require(set(entries) == set(o["entries"]), "ZIP entries changed")
    untouched = 0
    for name, raw in o["entries"].items():
        if name not in ("Contents/header.xml", o["sectionName"]):
            require(entries[name] == raw, "unrelated ZIP entry " + name)
            untouched += 1
    new_section, new_header = parse(entries[o["sectionName"]]), parse(entries["Contents/header.xml"])
    expected_section = copy.deepcopy(o["section"]["root"])
    expected_elements = [n for n in expected_section.iter() if isinstance(n.tag, str)]
    expected_elements[o["cellIndex"]].set("borderFillIDRef", str(ref))
    require(tree(expected_section) == tree(new_section["root"]), "section full opaque XML tree changed")
    require(entries[o["sectionName"]] == splice(o["section"]["raw"], [
        attr_change(o["section"], o["cellIndex"], "borderFillIDRef", ref)]), "only tc reference bytes may change")

    container = one([e for e in new_header["elements"] if e.tag == "{" + HEAD + "}borderFills"], "new BF container")
    fills = [e for e in container if e.tag == "{" + HEAD + "}borderFill"]
    require(len(fills) == len(o["fills"]) + 1 and int(container.attrib["itemCnt"]) == len(fills), "one new BF/count")
    for old in o["fills"]:
        match = one([e for e in fills if e.attrib.get("id") == old.attrib["id"]], "original BF missing/duplicate")
        require(raw_node(o["header"], o["header"]["elements"].index(old)) ==
                raw_node(new_header, new_header["elements"].index(match)), "original BF bytes changed")
    clone = one([e for e in fills if e.attrib.get("id") == str(ref)], "new unique clone reference")
    expected_clone = copy.deepcopy(o["source"])
    expected_clone.set("id", str(ref))
    expected_clone.tail = None
    for op in operations:
        color = op["color"]
        require(type(color) is int and 0 <= color <= 0xffffff, "RGB24 required")
        encoded_color = swap(color) if o["encoding"] == "colorref24" else color
        if op["kind"] == "cell-background":
            brushes = [e for e in expected_clone if e.tag == "{" + CORE + "}fillBrush"]
            if brushes:
                win = one(list(brushes[0]), "expected winBrush")
            else:
                brush = ET.SubElement(expected_clone, "{" + CORE + "}fillBrush")
                win = ET.SubElement(brush, "{" + CORE + "}winBrush")
            win.set("faceColor", "#%06x" % encoded_color)
        else:
            require(op["kind"] == "cell-border", "unknown operation")
            require(type(op["edges"]) is int and 0 < op["edges"] <= 15, "edge mask")
            require(op["style"] in ("NONE", "SOLID", "DOUBLE_SLIM"), "style")
            require(op["width"] in (10,12,15,20,25,30,40,50,60,70,100,150,200,300,400,500), "width")
            for i, name in enumerate(("leftBorder", "rightBorder", "topBorder", "bottomBorder")):
                if op["edges"] & (1 << i):
                    edge = one([e for e in expected_clone if e.tag == "{" + HEAD + "}" + name], "expected edge")
                    edge.set("type", op["style"])
                    edge.set("width", "%g mm" % (op["width"] / 100))
                    edge.set("color", "#%06x" % color)
    changed_edges = {"{"+HEAD+"}"+name for i,name in enumerate(("leftBorder","rightBorder","topBorder","bottomBorder"))
                     if any(op["kind"] == "cell-border" and op["edges"] & (1<<i) for op in operations)}
    changed_background = any(op["kind"] == "cell-background" for op in operations)
    # Only requested fields are compared semantically; every other XML value stays exact.
    for actual, expected in zip(clone.iter(), expected_clone.iter()):
        for key in ("color", "faceColor"):
            changed = (key == "color" and expected.tag in changed_edges) or (key == "faceColor" and changed_background)
            if changed and key in expected.attrib and actual.attrib.get(key) != expected.attrib[key]:
                require(hexcolor(actual.attrib.get(key)) == hexcolor(expected.attrib[key]), "decoded color mismatch")
                expected.set(key, actual.attrib[key])
        if expected.tag in changed_edges:
            from decimal import Decimal
            require(Decimal(actual.attrib["width"].removesuffix(" mm")) == Decimal(expected.attrib["width"].removesuffix(" mm")), "decoded width mismatch")
            expected.set("width", actual.attrib["width"])
    require(tree(expected_clone) == tree(clone), "clone modifies more than requested edges/background")
    expected_header = copy.deepcopy(o["header"]["root"])
    expected_container = one([e for e in expected_header.iter() if e.tag == "{" + HEAD + "}borderFills"], "expected container")
    expected_container.set("itemCnt", str(len(fills)))
    expected_container.append(expected_clone)
    require(tree(expected_header) == tree(new_header["root"]), "header full opaque XML tree changed")
    old_container_i = o["header"]["elements"].index(o["container"])
    insertion = o["header"]["nodes"][old_container_i]["closeStart"]
    clone_raw = raw_node(new_header, new_header["elements"].index(clone))
    require(entries["Contents/header.xml"] == splice(o["header"]["raw"], [
        attr_change(o["header"], old_container_i, "itemCnt", len(fills)),
        (insertion, insertion, clone_raw)]), "unrelated header bytes changed")
    return {**public(o), "cloneRef": ref, "operations": operations,
            "untouchedEntries": untouched,
            "comparedSectionElements": len(o["section"]["elements"]),
            "comparedOriginalResources": len(o["fills"])}



if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.buffer.read(4 * LIMIT))
        print(json.dumps(verify(request), sort_keys=True))
    except Exception as error:
        print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        sys.exit(1)
