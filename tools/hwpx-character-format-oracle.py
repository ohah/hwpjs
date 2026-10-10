"""Independent ZIP/XML scalar-style oracle for plain text-only paragraphs."""
import base64
import copy
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
H = "{http://www.hancom.co.kr/hwpml/2011/head}"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def archive(encoded):
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded, validate=True)))


def protected_anchor(node):
    if node.tag in {P + name for name in ("tbl", "pic", "equation", "rect", "line", "container")}:
        return True
    return node.tag == P + "ctrl" and len(node) == 1 and node[0].tag in {P + name for name in ("footNote", "endNote", "autoNum")}


def signature(paragraph, allow_metadata=False, allow_tabs=False, allow_anchors=False):
    result = []
    units = 0
    for run in paragraph:
        if run.tag != P + "run":
            continue
        require(all((child.tag == P + "t" and (len(child) == 0 or allow_tabs)) or (allow_metadata and child.tag != P + "t") for child in run), "non-plain run")
        attrs = tuple(sorted((key, value) for key, value in run.attrib.items() if key != "charPrIDRef"))
        style = int(run.attrib["charPrIDRef"]) if "charPrIDRef" in run.attrib else None
        for text in run:
            if allow_anchors and protected_anchor(text):
                payload = copy.deepcopy(text)
                payload.tail = None
                result.append((units, units + 1, ("anchor", ET.tostring(payload)), style, attrs, ()))
                units += 1
                continue
            if text.tag != P + "t":
                continue
            chunks = [text.text or ""]
            for inline in text:
                require(allow_tabs and inline.tag in (P + "tab", P + "lineBreak", P + "nbSpace", P + "fwSpace", P + "hypen", P + "titleMark") and len(inline) == 0 and not inline.text, "unsupported style inline")
                if inline.tag != P + "titleMark":
                    chunks.append((inline.tag, tuple(sorted(inline.attrib.items()))))
                chunks.append(inline.tail or "")
            for chunk in chunks:
                for character in ([chunk] if isinstance(chunk, tuple) else chunk):
                    width = 1 if isinstance(character, tuple) else len(character.encode("utf-16-le")) // 2
                    result.append((units, units + width, character, style, attrs, tuple(sorted(text.attrib.items()))))
                    units += width
    return result, units


def metadata_signature(paragraph, allow_tabs=False, allow_anchors=False):
    result = []
    units = 0
    for run in paragraph:
        if run.tag != P + "run":
            continue
        for child in run:
            if allow_anchors and protected_anchor(child):
                units += 1
                continue
            if child.tag == P + "t":
                require(len(child) == 0 or allow_tabs, "inline control")
                units += len((child.text or "").encode("utf-16-le")) // 2
                for inline in child:
                    require(inline.tag in (P + "tab", P + "lineBreak", P + "nbSpace", P + "fwSpace", P + "hypen", P + "titleMark") and len(inline) == 0 and not inline.text, "unsupported metadata inline")
                    if inline.tag == P + "titleMark":
                        payload = copy.deepcopy(inline)
                        payload.tail = None
                        result.append((units, ET.tostring(payload)))
                    else:
                        units += 1
                    units += len((inline.tail or "").encode("utf-16-le")) // 2
            else:
                result.append((units, ET.tostring(child)))
    return result


def anchored_display_ranges(paragraph):
    """Direct shape anchors and tabs only; never flatten nested paragraphs."""
    rows = []
    units = 0

    def append(text, style):
        nonlocal units
        for char in text:
            width = len(char.encode("utf-16-le")) // 2
            rows.append({"start": units, "end": units + width, "charShapeId": style})
            units += width

    shapes = {P + name for name in ("tbl", "pic", "equation", "rect", "line", "container")}
    for run in paragraph:
        if run.tag != P + "run":
            continue
        style = int(run.attrib["charPrIDRef"]) if "charPrIDRef" in run.attrib else None
        for child in run:
            if child.tag == P + "t":
                append(child.text or "", style)
                for inline in child:
                    require(inline.tag == P + "tab" and len(inline) == 0, "unsupported display inline")
                    append("\t", style)
                    append(inline.tail or "", style)
            elif child.tag in shapes:
                append("\ufffc", style)
            elif child.tag == P + "ctrl":
                require(len(child) == 1 and child[0].tag == P + "colPr", "unsupported display ctrl")
            else:
                require(child.tag == P + "secPr", "unsupported display run child")
    return {"units": units, "ranges": rows}


def main():
    data = json.load(sys.stdin)
    with archive(data["before"]) as before:
        ids = sorted(int(node.attrib["id"]) for node in ET.fromstring(before.read("Contents/header.xml")).iter(H + "charPr"))
        if data.get("mode") == "ids":
            print(json.dumps(ids))
            return
        if data.get("mode") == "display-resources":
            root = ET.fromstring(before.read("Contents/header.xml"))
            shapes = [{"id": int(node.attrib["id"]), "height": int(node.attrib["height"]) if "height" in node.attrib else None, "bold": node.find(H + "bold") is not None, "italic": node.find(H + "italic") is not None} for node in root.findall(H + "refList/" + H + "charProperties/" + H + "charPr")]
            print(json.dumps(sorted(shapes, key=lambda shape: shape["id"])))
            return
        if data.get("mode") in ("style-ranges", "anchor-style-ranges"):
            root = ET.fromstring(before.read(data.get("part", "Contents/section0.xml")))
            paragraphs = list(root.iter(P + "p"))
            index = data["paragraph"] - 1
            require(0 <= index < len(paragraphs), "paragraph index")
            if data.get("mode") == "anchor-style-ranges":
                print(json.dumps(anchored_display_ranges(paragraphs[index])))
                return
            rows, units = signature(paragraphs[index], True)
            print(json.dumps({"units": units, "ranges": [{"start": row[0], "end": row[1], "charShapeId": row[3]} for row in rows]}))
            return
        if data.get("mode") == "topology":
            part = data.get("part", "Contents/section0.xml")
            root = ET.fromstring(before.read(part))
            paragraphs = list(root.iter(P + "p"))
            index = data["paragraph"] - 1
            require(0 <= index < len(paragraphs), "paragraph index")
            paragraph = paragraphs[index]
            print(json.dumps({
                "scope": "raw XML paragraph order; not selected-branch or layout semantics",
                "part": part,
                "paragraph": data["paragraph"],
                "children": [child.tag for child in paragraph],
                "runs": [{
                    "children": [child.tag for child in run],
                    "controls": [[child.tag for child in node] for node in run if node.tag == P + "ctrl"],
                    "textChildren": [[child.tag for child in node] for node in run if node.tag == P + "t"],
                } for run in paragraph if run.tag == P + "run"],
            }))
            return
        with archive(data["after"]) as after:
            require(before.namelist() == after.namelist(), "ZIP inventory changed")
            if data.get("mode") in ("tab-format", "anchor-format"):
                require(after.testzip() is None and before.comment == after.comment, "ZIP integrity or comment changed")
                for entry in before.infolist():
                    current = after.getinfo(entry.filename)
                    for field in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                        require(getattr(entry, field) == getattr(current, field), "ZIP metadata changed: " + field)
            part = data.get("part", "Contents/section0.xml")
            for name in before.namelist():
                if name != part:
                    require(before.read(name) == after.read(name), "non-target ZIP entry changed: " + name)
            old = ET.fromstring(before.read(part))
            new = ET.fromstring(after.read(part))
            originals = list(old.iter(P + "p"))
            saved = list(new.iter(P + "p"))
            index = data["paragraph"] - 1
            require(0 <= index < len(originals), "paragraph index")
            if data.get("mode") == "anchor-prefix":
                require(len(originals) == len(saved), "anchor prefix paragraph count")
                run = next((child for child in originals[index] if child.tag == P + "run"), None)
                require(run is not None and len(run) > 0 and protected_anchor(run[0]), "anchor prefix topology")
                leaf = ET.Element(P + "t")
                leaf.text = data["text"]
                run.insert(0, leaf)
                require(ET.tostring(old) == ET.tostring(new), "anchor prefix XML or non-target content changed")
                print(json.dumps({"verified": True}))
                return
            if data.get("mode") == "nested-empty":
                require(len(originals) == len(saved), "nested paragraph count")
                runs = [child for child in originals[index] if child.tag == P + "run"]
                require(len(runs) == 1 and len(runs[0]) == 0 and not (runs[0].text or ""), "empty nested run topology")
                leaf = ET.SubElement(runs[0], P + "t")
                leaf.text = data["text"]
                require(ET.tostring(old) == ET.tostring(new), "empty nested XML or non-target content changed")
                print(json.dumps({"verified": True}))
                return
            if data.get("mode") == "nested-prefix":
                require(len(originals) == len(saved), "nested paragraph count")
                first = next(originals[index].iter(P + "t"), None)
                require(first is not None and len(first) == 0, "nested prefix text topology")
                first.text = data["text"] + (first.text or "")
                require(ET.tostring(old) == ET.tostring(new), "nested XML or non-target content changed")
                print(json.dumps({"verified": True}))
                return
            if data.get("mode") == "merge":
                require(index + 1 < len(originals) and len(saved) == len(originals) - 1, "merge paragraph count")
                left, left_units = signature(originals[index])
                right, right_units = signature(originals[index + 1])
                expected = left + [(lo + left_units, hi + left_units, char, style, attrs, text_attrs) for lo, hi, char, style, attrs, text_attrs in right]
                actual, length = signature(saved[index])
                require(actual == expected and length == left_units + right_units, "merge style signature mismatch")
                require(originals[index].attrib == saved[index].attrib, "merge left paragraph attributes")
                parents = {child: parent for parent in old.iter() for child in parent}
                require(parents[originals[index]] is parents[originals[index + 1]], "merge owner")
                originals[index].clear()
                saved[index].clear()
                parents[originals[index + 1]].remove(originals[index + 1])
                require(ET.tostring(old) == ET.tostring(new), "merge non-target XML changed")
                print(json.dumps({"verified": True, "units": length}))
                return
            if data.get("mode") in ("split", "metadata-split"):
                allow_metadata = data.get("mode") == "metadata-split"
                require(len(saved) == len(originals) + 1, "split paragraph count")
                expected, length = signature(originals[index], allow_metadata)
                at, end = data["startUnit"], data["endUnit"]
                boundaries = {0, length} | {row[0] for row in expected} | {row[1] for row in expected}
                require(0 <= at <= end <= length and at in boundaries and end in boundaries, "split range")
                left, left_length = signature(saved[index], allow_metadata)
                right, right_length = signature(saved[index + 1], allow_metadata)
                left_expected = [row for row in expected if row[1] <= at]
                right_expected = [(lo - end, hi - end, char, style, attrs, text_attrs) for lo, hi, char, style, attrs, text_attrs in expected if lo >= end]
                require(left == left_expected and right == right_expected and left_length == at and right_length == length - end, "split style signature mismatch")
                if allow_metadata:
                    require(at == end, "metadata split deletion unsupported by oracle")
                    metadata = metadata_signature(saved[index]) + [(unit + at, xml) for unit, xml in metadata_signature(saved[index + 1])]
                    require(metadata == metadata_signature(originals[index]), "split metadata signature mismatch")
                require(originals[index].attrib == saved[index].attrib, "split left paragraph attributes")
                generated_id = saved[index + 1].get("id")
                require(generated_id is not None and all(node.get("id") != generated_id for node in originals), "split generated ID collision")
                parents = {child: parent for parent in new.iter() for child in parent}
                require(parents[saved[index]] is parents[saved[index + 1]], "split owner")
                originals[index].clear()
                saved[index].clear()
                parents[saved[index + 1]].remove(saved[index + 1])
                require(ET.tostring(old) == ET.tostring(new), "split non-target XML changed")
                print(json.dumps({"verified": True, "leftUnits": left_length, "rightUnits": right_length}))
                return
            require(len(originals) == len(saved), "paragraph count changed")
            start, end, style = data["startUnit"], data["endUnit"], data["charShapeId"]
            require(style in ids, "unknown resource ID")
            field_format = data.get("mode") == "field-format"
            tab_format = data.get("mode") == "tab-format"
            anchor_format = data.get("mode") == "anchor-format"
            expected, length = signature(originals[index], field_format or tab_format or anchor_format, tab_format or anchor_format, anchor_format)
            actual, actual_length = signature(saved[index], field_format or tab_format or anchor_format, tab_format or anchor_format, anchor_format)
            if field_format or tab_format or anchor_format:
                require(metadata_signature(originals[index], tab_format or anchor_format, anchor_format) == metadata_signature(saved[index], tab_format or anchor_format, anchor_format), "field metadata or position changed")
            require(0 <= start <= end <= length, "range")
            boundaries = {0, length} | {row[0] for row in expected} | {row[1] for row in expected}
            require(start in boundaries and end in boundaries, "surrogate boundary")
            expected = [(lo, hi, char, style if lo >= start and hi <= end and start != end else original_style, attrs, text_attrs) for lo, hi, char, original_style, attrs, text_attrs in expected]
            require(actual_length == length and actual == expected, "text/style/attribute signature mismatch")
            require(originals[index].attrib == saved[index].attrib, "paragraph attributes changed")
            originals[index].clear()
            saved[index].clear()
            require(ET.tostring(old) == ET.tostring(new), "non-target XML changed")
            print(json.dumps({"verified": True, "units": length, "scalars": len(actual)}))


if __name__ == "__main__":
    main()
