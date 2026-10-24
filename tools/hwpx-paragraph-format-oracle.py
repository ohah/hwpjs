"""Independent paragraph reference oracle using Python standard ZIP/XML."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
import copy

def require(condition, detail):
    if not condition:
        raise ValueError(detail)

request = json.load(sys.stdin)
def parse_xml(value):
    if request.get("mode") == "conditional-percent-spacing":
        return ET.fromstring(value, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))
    return ET.fromstring(value)

before = zipfile.ZipFile(io.BytesIO(base64.b64decode(request["before"])))
opf = "{http://www.idpf.org/2007/opf/}"
hp = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
manifest = parse_xml(before.read("Contents/content.hpf"))
items = {item.attrib["id"]: item.attrib["href"] for item in manifest.findall(".//" + opf + "item")}
parts = []
for ref in manifest.findall(".//" + opf + "itemref"):
    href = items[ref.attrib["idref"]]
    path = href if href.startswith("Contents/") else "Contents/" + href
    if parse_xml(before.read(path)).tag == "{http://www.hancom.co.kr/hwpml/2011/section}sec":
        parts.append(path)
sections = [parse_xml(before.read(path)) for path in parts]
paragraphs = [list(section.iter(hp + "p")) for section in sections]
if request.get("mode") == "fixture-default-margin-unit":
    hh = "{http://www.hancom.co.kr/hwpml/2011/head}"
    href = items["header"]
    path = href if href.startswith("Contents/") else "Contents/" + href
    header = ET.fromstring(before.read(path))
    for margin in header.iter(hh + "margin"):
        for child in margin:
            if child.attrib.get("unit") == "HWPUNIT":
                del child.attrib["unit"]
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as output:
        for info in before.infolist():
            output.writestr(info, ET.tostring(header, encoding="utf-8") if info.filename == path else before.read(info.filename))
    print(json.dumps({"bytes": base64.b64encode(result.getvalue()).decode("ascii")}))
elif request.get("mode") == "resources":
    hh = "{http://www.hancom.co.kr/hwpml/2011/head}"
    hc = "{http://www.hancom.co.kr/hwpml/2011/core}"
    header_items = [item for item in manifest.findall(".//" + opf + "item") if item.attrib.get("id") == "header"]
    require(len(header_items) == 1, "Missing or duplicate header manifest item")
    href = header_items[0].attrib["href"]
    path = href if href.startswith("Contents/") else "Contents/" + href
    header = ET.fromstring(before.read(path))
    resources = []
    for para in header.findall("./" + hh + "refList/" + hh + "paraProperties/" + hh + "paraPr"):
        break_nodes = para.findall(hh + "breakSetting")
        require(len(break_nodes) <= 1, "Duplicate paragraph break settings")
        break_settings = None
        if break_nodes:
            break_settings = {}
            for source_name, key in [("widowOrphan", "widow_orphan"), ("keepWithNext", "keep_with_next"), ("keepLines", "keep_lines"), ("pageBreakBefore", "page_break_before")]:
                raw = break_nodes[0].get(source_name)
                require(raw is None or raw.strip() in ("0", "1", "false", "true"), "Invalid paragraph break boolean")
                break_settings[key] = None if raw is None else raw.strip() in ("1", "true")
        align = para.find(hh + "align")
        spacing = para.find(hh + "lineSpacing")
        margin = para.find(hh + "margin")
        values = {}
        for name in ["intent", "left", "right", "prev", "next"]:
            node = None if margin is None else margin.find(hc + name)
            values[name] = None if node is None else dict(node.attrib)
        resources.append({"break_settings": break_settings, "id": int(para.attrib["id"]), "tab_pr_id": None if para.get("tabPrIDRef") is None else int(para.get("tabPrIDRef")), "align": None if align is None else dict(align.attrib), "lineSpacing": None if spacing is None else dict(spacing.attrib), "margin": values})
    print(json.dumps({"resources": resources}))
elif request.get("mode") == "inventory":
    print(json.dumps({"sections": [[int(p.attrib["paraPrIDRef"]) for p in group] for group in paragraphs]}))
elif request.get("mode") in ("alignment", "margins", "spacing", "conditional-percent-spacing"):
    after = zipfile.ZipFile(io.BytesIO(base64.b64decode(request["after"])))
    require(before.namelist() == after.namelist(), "ZIP entry list changed")
    hh = "{http://www.hancom.co.kr/hwpml/2011/head}"
    href = items["header"]
    header_path = href if href.startswith("Contents/") else "Contents/" + href
    header = parse_xml(before.read(header_path))
    properties = header.find("./" + hh + "refList/" + hh + "paraProperties")
    require(properties is not None, "Missing paragraph properties")
    section = request["section"]
    selected = paragraphs[section][request["localParagraph"]]
    source_id = selected.attrib["paraPrIDRef"]
    templates = [node for node in properties if node.tag == hh + "paraPr" and node.attrib.get("id") == source_id]
    require(len(templates) == 1, "Missing or duplicate template")
    new_id = str(request["paraShapeId"])
    require(all(node.attrib.get("id") != new_id for node in properties), "New ID already exists")
    added = copy.deepcopy(templates[0])
    added.set("id", new_id)
    align = added.find(hh + "align")
    require(align is not None, "Missing alignment")
    if request.get("mode") == "alignment":
        align.set("horizontal", request["alignment"])
    elif request.get("mode") in ("spacing", "conditional-percent-spacing"):
        if request.get("mode") == "conditional-percent-spacing":
            require(added.find(hh + "lineSpacing") is None, "Expected conditional spacing")
            wrappers = added.findall(hp + "switch")
            require(len(wrappers) == 1, "Expected exactly one spacing switch")
            cases, defaults = wrappers[0].findall(hp + "case"), wrappers[0].findall(hp + "default")
            elements = [child for child in wrappers[0] if isinstance(child.tag, str)]
            require(len(cases) == len(defaults) == 1 and len(elements) == 2, "Invalid spacing branches")
            required = cases[0].attrib.get(hp + "required-namespace", "").split()
            require(bool(required) and all(value == "http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" for value in required), "Unsupported spacing case")
            spacings = [branch.findall(hh + "lineSpacing") for branch in (cases[0], defaults[0])]
            require(all(len(nodes) == 1 for nodes in spacings), "Missing or duplicate branch spacing")
            spacings = [nodes[0] for nodes in spacings]
            require(request["spacing"]["type"] == "PERCENT", "Only percentage branch edits are verified")
        else:
            spacing = added.find(hh + "lineSpacing")
            require(spacing is not None, "Missing line spacing")
            spacings = [spacing]
        kind, value = request["spacing"]["type"], request["spacing"]["value"]
        require(kind in ("PERCENT", "FIXED", "BETWEEN_LINES", "AT_LEAST"), "Invalid spacing type")
        require(type(value) is int and -2147483648 <= value <= 2147483647, "Invalid spacing value")
        if kind == "PERCENT":
            require(0 <= value <= 500, "Invalid spacing percent")
        else:
            require(all(spacing.attrib.get("unit", "HWPUNIT") == "HWPUNIT" for spacing in spacings), "Unsupported spacing unit")
        for spacing in spacings:
            spacing.set("type", kind)
            spacing.set("value", str(value))
    else:
        hc = "{http://www.hancom.co.kr/hwpml/2011/core}"
        margin = added.find(hh + "margin")
        require(margin is not None, "Missing margin")
        names = {"indent": "intent", "left": "left", "right": "right", "before": "prev", "after": "next"}
        for key, value in request["margins"].items():
            require(key in names, "Unknown margin")
            if value is None:
                continue
            require(type(value) is int and -2147483648 <= value <= 2147483647, "Invalid margin")
            node = margin.find(hc + names[key])
            require(node is not None and node.attrib.get("unit", "HWPUNIT") == "HWPUNIT", "Unsupported margin")
            node.set("value", str(value))
    properties.append(added)
    properties.set("itemCnt", str(int(properties.attrib["itemCnt"]) + 1))
    selected.set("paraPrIDRef", new_id)
    for name in before.namelist():
        if name == header_path:
            require(ET.tostring(header) == ET.tostring(parse_xml(after.read(name))), name)
        elif name == parts[section]:
            require(ET.tostring(sections[section]) == ET.tostring(parse_xml(after.read(name))), name)
        else:
            require(before.read(name) == after.read(name), name)
    print(json.dumps({"verified": True}))
else:
    after = zipfile.ZipFile(io.BytesIO(base64.b64decode(request["after"])))
    require(before.namelist() == after.namelist(), "ZIP entry list changed")
    section = request["section"]
    paragraphs[section][request["localParagraph"]].set("paraPrIDRef", str(request["paraShapeId"]))
    for name in before.namelist():
        if name == parts[section]:
            require(ET.tostring(sections[section]) == ET.tostring(ET.fromstring(after.read(name))), name)
        else:
            require(before.read(name) == after.read(name), name)
    print(json.dumps({"verified": True, "unchangedOtherEntries": len(before.namelist()) - 1}))
