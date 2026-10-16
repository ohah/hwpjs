"""Independent plain text property selection oracle; standard ZIP/XML only."""
import base64
import copy
import io
import json
import runpy
import sys
import zipfile
import xml.etree.ElementTree as ET
BOOLEAN_ELEMENTS = {"italic": "italic", "bold": "bold", "emboss": "emboss", "engrave": "engrave", "superscript": "supscript", "subscript": "subscript"}


def parse_xml(data):
    return ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))


def require(condition, detail):
    if not condition:
        raise ValueError(detail)


def matches(source, patch):
    if "outlineKind" in patch:
        outline = source.find(hh + "outline")
        token = "NONE" if outline is None else outline.get("type")
        if token != patch["outlineKind"].upper():
            return False
    if "shadeColor" in patch:
        expected = "#ffffffff" if patch["shadeColor"] is None else f'#{patch["shadeColor"]:06x}'
        if source.attrib.get("shadeColor", "").lower() != expected:
            return False
    if "underlineKind" in patch:
        underline = source.find(hh + "underline")
        if (underline.get("type", "NONE") if underline is not None else "NONE") != patch["underlineKind"].upper():
            return False
    if "fontIds" in patch:
        font = source.find(hh + "fontRef")
        if font is None or any(font.get(language) is None or int(font.get(language)) != identity for language, identity in patch["fontIds"].items()):
            return False
    return ("textColor" not in patch or source.attrib.get("textColor", "").lower() == f'#{patch["textColor"]:06x}') and ("size" not in patch or int(source.attrib.get("height", "1000")) == patch["size"]) and all(
        key not in patch or (source.find(hh + tag) is not None) == patch[key] for key, tag in BOOLEAN_ELEMENTS.items())


def clone_resource(source, identity, patch):
    added = copy.deepcopy(source)
    added.set("id", str(identity))
    if "fontIds" in patch:
        font = added.find(hh + "fontRef")
        require(font is not None, "Missing fontRef")
        for language, font_id in patch["fontIds"].items():
            font.set(language, str(font_id))
    if "textColor" in patch:
        added.set("textColor", f'#{patch["textColor"]:06x}')
    if "shadeColor" in patch:
        added.set("shadeColor", "#FFFFFFFF" if patch["shadeColor"] is None else f'#{patch["shadeColor"]:06x}')
    if "size" in patch:
        added.set("height", str(patch["size"]))
    order = ["italic", "bold", "underline", "strikeout", "outline", "shadow", "emboss", "engrave", "supscript", "subscript"]
    if "outlineKind" in patch:
        outline = added.find(hh + "outline")
        if outline is None:
            outline = ET.Element(hh + "outline")
            following = {hh + name for name in order[order.index("outline") + 1:]}
            index = next((i for i, node in enumerate(added) if node.tag in following), len(added))
            added.insert(index, outline)
        outline.set("type", patch["outlineKind"].upper())
    if "underlineKind" in patch:
        underline = added.find(hh + "underline")
        if underline is None:
            underline = ET.Element(hh + "underline", {"type": "NONE", "shape": "SOLID", "color": "#000000"})
            following = {hh + name for name in order[order.index("underline") + 1:]}
            index = next((i for i, node in enumerate(added) if node.tag in following), len(added))
            added.insert(index, underline)
        underline.set("type", patch["underlineKind"].upper())
    for key, tag in BOOLEAN_ELEMENTS.items():
        if key not in patch:
            continue
        flag = added.find(hh + tag)
        if not patch[key] and flag is not None:
            added.remove(flag)
        elif patch[key] and flag is None:
            index = next((i for i, node in enumerate(added) if node.tag in [hh + name for name in order[order.index(tag) + 1:]]), len(added))
            added.insert(index, ET.Element(hh + tag))
    return added


def resource_key(source):
    value = copy.deepcopy(source)
    value.set("id", "0")
    value.tail = None
    for node in value.iter():
        attributes = sorted(node.attrib.items())
        node.attrib.clear()
        node.attrib.update(attributes)
    return ET.tostring(value)


def owner_tags(parents, element):
    result = []
    owner = parents.get(element)
    while owner is not None:
        if isinstance(owner.tag, str):
            result.append(owner.tag.rsplit("}", 1)[-1])
        owner = parents.get(owner)
    return result


def verify_entries(before, after, replacements):
    require(before.namelist() == after.namelist(), "ZIP entries changed")
    for name in before.namelist():
        if name in replacements:
            expected_bytes = ET.tostring(replacements[name])
            actual_bytes = ET.tostring(parse_xml(after.read(name)))
            if expected_bytes != actual_bytes:
                offset = next((i for i, pair in enumerate(zip(expected_bytes, actual_bytes)) if pair[0] != pair[1]), min(len(expected_bytes), len(actual_bytes)))
                raise ValueError(f"XML differs: {name} at {offset}: expected {expected_bytes[offset:offset+160]!r}, actual {actual_bytes[offset:offset+160]!r}")
        else:
            require(before.read(name) == after.read(name), "Unrelated entry differs: " + name)


request = json.load(sys.stdin)
require(request.get("mode") in (None, "inventory", "metadata-inventory", "font-inventory", "materialize-empty", "field-properties", "anchor-properties", "tab-properties"), "Unknown property oracle mode")
before = zipfile.ZipFile(io.BytesIO(base64.b64decode(request["before"])))
hp = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
hh = "{http://www.hancom.co.kr/hwpml/2011/head}"
opf = "{http://www.idpf.org/2007/opf/}"
manifest = parse_xml(before.read("Contents/content.hpf"))
items = {node.attrib["id"]: node.attrib["href"] for node in manifest.iter(opf + "item")}
def path(href):
    return href if href.startswith("Contents/") else "Contents/" + href
parts = [path(items[node.attrib["idref"]]) for node in manifest.iter(opf + "itemref")]
parts = [name for name in parts if parse_xml(before.read(name)).tag.endswith("}sec")]
if request.get("mode") in ("inventory", "metadata-inventory", "font-inventory"):
    font_inventory = request.get("mode") == "font-inventory"
    if font_inventory:
        font_header = parse_xml(before.read(path(items["header"])))
        font_tables = {group.get("lang").lower(): [int(font.get("id")) for font in group.findall(hh + "font")] for group in font_header.findall('./' + hh + 'refList/' + hh + 'fontfaces/' + hh + 'fontface')}
        font_shapes = {int(shape.get("id")): shape.find(hh + "fontRef") for shape in font_header.findall('./' + hh + 'refList/' + hh + 'charProperties/' + hh + 'charPr')}
    candidates = []
    excluded = 0
    exclusions = []
    reasons = {}
    document_ordinal = 0
    for section_index, name in enumerate(parts):
        root = parse_xml(before.read(name))
        parents = {child: parent for parent in root.iter() for child in parent}
        for ordinal, paragraph in enumerate(root.iter(hp + "p")):
            document_ordinal += 1
            runs = paragraph.findall(hp + "run")
            plain = bool(runs) and all(len(run) == 1 and run[0].tag == hp + "t" and len(run[0]) == 0 and "charPrIDRef" in run.attrib for run in runs)
            if request.get("mode") == "metadata-inventory":
                plain = bool(runs) and all("charPrIDRef" in run.attrib and (len(run) == 1 and run[0].tag == hp + "t" and len(run[0]) == 0 or all(child.tag != hp + "t" or len(child) == 0 and not child.text for child in run)) for run in runs)
            if not plain:
                if not runs:
                    reason = "no-direct-run"
                elif any("charPrIDRef" not in run.attrib for run in runs):
                    reason = "missing-character-reference"
                elif any(child.tag != hp + "t" or len(child) != 0 for run in runs for child in run):
                    reason = "control-or-nested-text"
                elif any(len(run) == 0 for run in runs):
                    reason = "missing-text"
                elif any(len(run) > 1 for run in runs):
                    reason = "multiple-text"
                else:
                    reason = "other"
                reasons[reason] = reasons.get(reason, 0) + 1
                exclusions.append({"section": section_index, "localParagraph": ordinal, "paragraph": document_ordinal, "reason": reason, "ownerTags": owner_tags(parents, paragraph)})
                excluded += 1
                continue
            units = sum(len((child.text or "").encode("utf-16-le")) // 2 for run in runs for child in run if child.tag == hp + "t")
            if units:
                boundaries = [0]
                for run in runs:
                    for child in run:
                        if child.tag == hp + "t":
                            for character in child.text or "":
                                boundaries.append(boundaries[-1] + len(character.encode("utf-16-le")) // 2)
                candidates.append({"section": section_index, "localParagraph": ordinal, "paragraph": document_ordinal, "units": units, "boundaries": boundaries, "ownerTags": owner_tags(parents, paragraph)})
                if font_inventory:
                    spans = []; offset = 0
                    for run in runs:
                        length = len((run[0].text or '').encode('utf-16-le')) // 2
                        font = font_shapes[int(run.get('charPrIDRef'))]
                        spans.append({"start": offset, "end": offset + length, "fontIds": {} if font is None else {language: int(identity) for language, identity in font.attrib.items()}})
                        offset += length
                    candidates[-1]["fontRanges"] = spans
            else:
                reasons["empty-text"] = reasons.get("empty-text", 0) + 1
                exclusions.append({"section": section_index, "localParagraph": ordinal, "paragraph": document_ordinal, "reason": "empty-text", "ownerTags": owner_tags(parents, paragraph)})
                excluded += 1
    require(sum(reasons.values()) == excluded == len(exclusions), "Exclusion inventory mismatch")
    report = {"paragraphs": candidates, "excluded": excluded, "exclusionReasons": reasons, "exclusions": exclusions}
    if font_inventory:
        report["fontTables"] = font_tables
    print(json.dumps(report))
    sys.exit(0)
after = zipfile.ZipFile(io.BytesIO(base64.b64decode(request["after"])))
require(before.namelist() == after.namelist(), "ZIP entries changed")
header_path = path(items["header"])
header = parse_xml(before.read(header_path))
section_path = parts[request["section"]]
section = parse_xml(before.read(section_path))
paragraph = list(section.iter(hp + "p"))[request["localParagraph"]]
if request.get("mode") == "materialize-empty":
    runs = paragraph.findall(hp + "run")
    require(len(runs) == 1 and len(runs[0]) == 0, "Oracle requires one empty text run")
    require(type(request["inserted"]) is str and len(request["inserted"]) > 0, "Invalid inserted text")
    text = ET.SubElement(runs[0], hp + "t")
    text.text = request["inserted"]
    verify_entries(before, after, {section_path: section})
    print(json.dumps({"verified": True}))
    sys.exit(0)
properties = header.find("./" + hh + "refList/" + hh + "charProperties")
require(properties is not None, "Missing charProperties")
templates = {int(node.attrib["id"]): node for node in properties if node.tag == hh + "charPr"}
occupied = set(templates)
reusable_ids = request.get("reusableResourceIds", [])
require(type(reusable_ids) is list and all(type(identity) is int and identity in templates for identity in reusable_ids), "Invalid reusable resource IDs")
require(not reusable_ids or request.get("mode") is None, "Reusable IDs require plain property mode")
patch = request["properties"]
require(type(patch) is dict and set(patch) <= set(BOOLEAN_ELEMENTS) | {"size", "textColor", "shadeColor", "fontIds", "underlineKind", "outlineKind"}, "Invalid property keys")
if "outlineKind" in patch:
    require(patch["outlineKind"] in ("none", "solid"), "Invalid outline kind")
if "shadeColor" in patch:
    require(patch["shadeColor"] is None or type(patch["shadeColor"]) is int and 0 <= patch["shadeColor"] <= 0xffffff, "Invalid shade color")
if "underlineKind" in patch:
    require(patch["underlineKind"] in ("none", "bottom", "center", "top"), "Invalid underline kind")
if "fontIds" in patch:
    ids = patch["fontIds"]
    require(type(ids) is dict and bool(ids) and set(ids) <= {"hangul", "latin", "hanja", "japanese", "other", "symbol", "user"}, "Invalid font languages")
    for language, identity in ids.items():
        require(type(identity) is int and 0 <= identity <= 0xffffffff, "Invalid font ID")
        table = header.find('./' + hh + 'refList/' + hh + 'fontfaces/' + hh + "fontface[@lang='" + language.upper() + "']")
        require(table is not None and identity in {int(node.get('id')) for node in table.findall(hh + 'font')}, "Missing language font ID")
if "textColor" in patch:
    require(type(patch["textColor"]) is int and 0 <= patch["textColor"] <= 0xffffff, "Invalid text color")
if "size" in patch:
    require(type(patch["size"]) is int and 0 <= patch["size"] <= 409600, "Invalid character size")
for key in BOOLEAN_ELEMENTS:
    if key in patch:
        require(type(patch[key]) is bool, "Invalid character boolean")
created = {}
added_count = 0
length = 0
start, end = request.get("startUnit", 0), request["endUnit"]
require(type(start) is int and type(end) is int and 0 <= start <= end, "Invalid selection")
if request.get("mode") in ("field-properties", "anchor-properties", "tab-properties"):
    helpers = runpy.run_path("tools/hwpx-character-format-oracle.py")
    signature, metadata = helpers["signature"], helpers["metadata_signature"]
    allow_anchors = request["mode"] == "anchor-properties"
    allow_tabs = request["mode"] in ("anchor-properties", "tab-properties")
    expected, length = signature(paragraph, True, allow_tabs, allow_anchors)
    boundaries = {0, length} | {row[0] for row in expected} | {row[1] for row in expected}
    require(end <= length and start in boundaries and end in boundaries, "Invalid field selection")
    rows = []
    for low, high, character, identity, attrs, text_attrs in expected:
        if start <= low and high <= end and start != end and not matches(templates[identity], patch):
            if identity not in created:
                new_id = 0
                while new_id in occupied:
                    new_id += 1
                occupied.add(new_id)
                created[identity] = new_id
                properties.append(clone_resource(templates[identity], new_id, patch))
            identity = created[identity]
        rows.append((low, high, character, identity, attrs, text_attrs))
    actual_section = parse_xml(after.read(section_path))
    actual_paragraph = list(actual_section.iter(hp + "p"))[request["localParagraph"]]
    actual, actual_length = signature(actual_paragraph, True, allow_tabs, allow_anchors)
    require(actual_length == length and rows == actual, "Field text/style/attribute mismatch")
    require(metadata(paragraph, allow_tabs, allow_anchors) == metadata(actual_paragraph, allow_tabs, allow_anchors), "Field marker XML or position changed")
    require(paragraph.attrib == actual_paragraph.attrib, "Field paragraph attributes changed")
    if created:
        require(actual_paragraph.find(hp + "linesegarray") is None, "Stale field layout cache retained")
    require([ET.tostring(node) for node in paragraph if node.tag not in (hp + "run", hp + "linesegarray")] ==
            [ET.tostring(node) for node in actual_paragraph if node.tag not in (hp + "run", hp + "linesegarray")], "Field paragraph metadata changed")
    checked_section = copy.deepcopy(actual_section)
    paragraph.clear()
    actual_paragraph.clear()
    require(ET.tostring(section) == ET.tostring(actual_section), "Non-target section XML changed")
    properties.set("itemCnt", str(int(properties.attrib["itemCnt"]) + len(created)))
    verify_entries(before, after, {header_path: header, section_path: checked_section})
    print(json.dumps({"verified": True, "newResources": len(created), "scalars": len(actual)}))
    sys.exit(0)
for run in list(paragraph.findall(hp + "run")):
    preserve_metadata = request.get("preserveUnselectedMetadata", False)
    require(type(preserve_metadata) is bool, "Invalid metadata preservation mode")
    if not preserve_metadata:
        require(all(child.tag == hp + "t" and len(child) == 0 for child in run), "Oracle requires plain text runs")
    units = sum(len((child.text or "").encode("utf-16-le")) // 2 for child in run if child.tag == hp + "t")
    run_start = length
    length += units
    low, high = max(start, run_start), min(end, length)
    if units == 0 or low >= high:
        continue
    require(all(child.tag == hp + "t" and len(child) == 0 for child in run), "Selected run requires plain text children")
    source_id = int(run.attrib["charPrIDRef"])
    source = templates[source_id]
    if matches(source, patch):
        continue
    if source_id not in created:
        expected_key = resource_key(clone_resource(source, 0, patch))
        reused = next((identity for identity in reusable_ids if resource_key(templates[identity]) == expected_key), None)
        if reused is not None:
            created[source_id] = reused
        else:
            new_id = 0
            while new_id in occupied:
                new_id += 1
            occupied.add(new_id)
            created[source_id] = new_id
            properties.append(clone_resource(source, new_id, patch))
            added_count += 1
    require(len(run) == 1, "Selected run oracle requires one text child")
    encoded = (run[0].text or "").encode("utf-16-le")
    pieces = [(0, low - run_start, source_id), (low - run_start, high - run_start, created[source_id]), (high - run_start, units, source_id)]
    insertion = list(paragraph).index(run)
    paragraph.remove(run)
    nonempty = [(left, right, identity) for left, right, identity in pieces if left < right]
    for index, (left, right, identity) in enumerate(nonempty):
        piece = copy.deepcopy(run)
        piece.set("charPrIDRef", str(identity))
        piece[0].text = encoded[left * 2:right * 2].decode("utf-16-le")
        piece.tail = run.tail if index == len(nonempty) - 1 else None
        paragraph.insert(insertion + index, piece)
require(end <= length, "Selection outside paragraph")
properties.set("itemCnt", str(int(properties.attrib["itemCnt"]) + added_count))
if created:
    for cache in list(paragraph.findall(hp + "linesegarray")):
        paragraph.remove(cache)
verify_entries(before, after, {header_path: header, section_path: section})
result = {"verified": True, "newResources": added_count}
if "reusableResourceIds" in request:
    result["resourceIds"] = list(created.values())
print(json.dumps(result))
