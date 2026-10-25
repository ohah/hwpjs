"""Exact expected XML infoset + ZIP payload oracle for source-owned per-text-uniform title runs.
Expected output depends only on the source and requested operation; never on saved output.
"""
import json
from pathlib import Path
import runpy
import sys
from xml.dom import Node
from xml.dom.expatbuilder import ExpatBuilderNS
import xml.etree.ElementTree as ET

shared = runpy.run_path(str(Path(__file__).with_name("hwpx-character-format-oracle.py")))
require, archive = shared["require"], shared["archive"]
P = "http://www.hancom.co.kr/hwpml/2011/paragraph"
H = "http://www.hancom.co.kr/hwpml/2011/head"


def parse(raw):
    require(b"<!DOCTYPE" not in raw.upper(), "DOCTYPE unsupported by this oracle")
    # minidom otherwise drops empty CDATA and merges its adjacent text nodes.
    # That loses an original source binding even though the text is unchanged.
    class SourceDom(ExpatBuilderNS):
        def start_cdata_section_handler(self):
            super().start_cdata_section_handler()
            self.curNode.appendChild(self.document.createCDATASection(""))
            self._cdata_continue = True
    return SourceDom().parseString(raw)


def children_signature(node):
    result, text = [], ""
    for child in node.childNodes:
        if child.nodeType in (Node.TEXT_NODE, Node.CDATA_SECTION_NODE):
            text += child.data
            continue
        if text:
            result.append(("text", text))
            text = ""
        result.append(signature(child))
    if text:
        result.append(("text", text))
    return tuple(result)


def signature(node):
    if node.nodeType == Node.DOCUMENT_NODE:
        return ("document", node.version, node.encoding, node.standalone, children_signature(node))
    if node.nodeType == Node.ELEMENT_NODE:
        # Includes namespace declarations, all attributes, comments, PI and whitespace.
        attrs = tuple(sorted((a.namespaceURI or "", a.localName or a.name, a.value) for a in node.attributes.values()))
        return ("element", node.namespaceURI or "", node.localName or node.tagName, attrs, children_signature(node))
    if node.nodeType == Node.COMMENT_NODE:
        return ("comment", node.data)
    if node.nodeType == Node.PROCESSING_INSTRUCTION_NODE:
        return ("pi", node.target, node.data)
    raise ValueError("Unsupported XML node kind: " + str(node.nodeType))


def direct(node, local):
    return [n for n in node.childNodes if n.nodeType == Node.ELEMENT_NODE and n.namespaceURI == P and n.localName == local]


def has_visible_text(text):
    return any(n.nodeType in (Node.TEXT_NODE, Node.CDATA_SECTION_NODE) and n.data
               for n in text.childNodes)


def format_source_runs(target, style):
    """Semantic expectation: positive-width text gets new ID; empty owner keeps old ID.
    Split only at original text element boundaries; preserve every other node in order.
    Controls before the next text stay with the preceding group, once, unchanged.
    """
    for source_run in list(direct(target, "run")):
        texts = direct(source_run, "t")
        if not texts:
            continue
        old_style = source_run.getAttribute("charPrIDRef") if source_run.hasAttribute("charPrIDRef") else None
        for text in texts:
            # This slice supports text plus zero-width source title gaps only.
            for inline in text.childNodes:
                if inline.nodeType != Node.ELEMENT_NODE:
                    continue
                require(inline.namespaceURI == P and inline.localName == "titleMark" and not inline.childNodes,
                        "unsupported text inline in source expectation")
        styles = {id(t): str(style) if has_visible_text(t) else old_style for t in texts}
        current_style = styles[id(texts[0])]
        groups = []
        nodes = []
        for child in list(source_run.childNodes):
            if child.nodeType == Node.ELEMENT_NODE and child.namespaceURI == P and child.localName == "t":
                requested = styles[id(child)]
                if requested != current_style:
                    groups.append((current_style, nodes))
                    nodes = []
                    current_style = requested
            nodes.append(child)
        groups.append((current_style, nodes))
        for expected_style, children in groups:
            run = source_run.cloneNode(False)
            if expected_style is None:
                if run.hasAttribute("charPrIDRef"):
                    run.removeAttribute("charPrIDRef")
            else:
                run.setAttribute("charPrIDRef", expected_style)
            for child in children:
                run.appendChild(child.cloneNode(True))
            target.insertBefore(run, source_run)
        target.removeChild(source_run)
        source_run.unlink()


def expected_partial_source_run(target, style, start, end):
    require(type(start) is int and type(end) is int and 0 <= start < end,
            'partial range')
    runs = direct(target, 'run')
    require(len(runs) == 1, 'partial fixture requires one source run')
    source = runs[0]
    old_style = source.getAttribute('charPrIDRef')
    require(bool(old_style), 'explicit source style required')
    offset = 0
    mixed_text = False
    fragments, pending = [], []

    def fragment(text, value, selected):
        run = source.cloneNode(False)
        run.setAttribute('charPrIDRef', str(style) if selected else old_style)
        t = text.cloneNode(False)
        if value:
            t.appendChild(target.ownerDocument.createTextNode(value))
        run.appendChild(t)
        return run, t

    for child in source.childNodes:
        if not (child.nodeType == Node.ELEMENT_NODE and child.namespaceURI == P and child.localName == 't'):
            if fragments:
                fragments[-1][0].appendChild(child.cloneNode(True))
            else:
                pending.append(child)
            continue
        text_styles = set()
        # Each CharData or whole-CDATA source item is a distinct binding.
        # minidom preserves these source node boundaries; do not merge them.
        sites, content_since_marker = [], False
        for node in child.childNodes:
            if node.nodeType in (Node.TEXT_NODE, Node.CDATA_SECTION_NODE):
                sites.append((node.data, None))
                content_since_marker = True
            else:
                require(node.nodeType == Node.ELEMENT_NODE and node.namespaceURI == P and node.localName == 'titleMark' and not node.childNodes,
                        'partial fixture title-only inline')
                if content_since_marker:
                    value, previous = sites.pop()
                    require(previous is None, 'partial source marker order')
                    sites.append((value, node))
                else:
                    # A zero-width gap keeps its old style, including edges.
                    sites.append(('', node))
                content_since_marker = False
        if not content_since_marker:
            sites.append(('', None))
        for text, marker in sites:
            boundaries, units = {0: 0}, 0
            for index, scalar in enumerate(text):
                units += len(scalar.encode('utf-16-le')) // 2
                boundaries[units] = index + 1
            cuts = sorted({0, units, *[p - offset for p in (start, end) if offset < p < offset + units]})
            require(all(c in boundaries for c in cuts), 'partial range splits surrogate')
            intervals = list(zip(cuts, cuts[1:])) if units else [(0, 0)]
            for low, high in intervals:
                selected = high > low and start <= offset + low and offset + high <= end
                text_styles.add(str(style) if selected else old_style)
                item = fragment(child, text[boundaries[low]:boundaries[high]], selected)
                if not fragments:
                    for prefix in pending:
                        item[0].insertBefore(prefix.cloneNode(True), item[1])
                    pending = []
                fragments.append(item)
            if marker is not None:
                fragments[-1][1].appendChild(marker.cloneNode(True))
            offset += units
        mixed_text = mixed_text or len(text_styles) > 1
    require(end <= offset and fragments and not pending, 'partial range or source shape')
    require(mixed_text, 'partial fixture must split one source text style')
    for run, _ in fragments:
        target.insertBefore(run, source)
    target.removeChild(source)
    source.unlink()


def verify(data):
    part = data.get("part", "Contents/section0.xml")
    require(part == "Contents/section0.xml", "oracle fixture part")
    paragraph = data["paragraph"]
    require(type(paragraph) is int and paragraph >= 1, "paragraph index")
    mode = data["mode"]
    require(mode in ("per-text-field-title-format", "per-text-format-and-replace", "partial-field-title-format"), "oracle mode")
    with archive(data["before"]) as before, archive(data["after"]) as after:
        names = before.namelist()
        require(names == after.namelist() and len(set(names)) == len(names), "ZIP inventory/order/duplicate")
        require(before.testzip() is None and after.testzip() is None, "ZIP CRC")
        require(before.comment == after.comment, "ZIP archive comment")
        for previous, current in zip(before.infolist(), after.infolist()):
            for key in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                require(getattr(previous, key) == getattr(current, key), "ZIP metadata: " + key)
            if previous.filename != part:
                require(before.read(previous) == after.read(current), "non-target ZIP payload: " + previous.filename)
        old_raw, new_raw = before.read(part), after.read(part)
        old, new = parse(old_raw), parse(new_raw)
        try:
            paragraphs = old.getElementsByTagNameNS(P, "p")
            require(paragraph <= len(paragraphs), "paragraph index")
            target = paragraphs[paragraph - 1]
            require(target.getElementsByTagNameNS(P, "fieldBegin").length > 0, "target field required")
            titles = target.getElementsByTagNameNS(P, "titleMark")
            require(titles.length == 1, "unique target title required")
            title = titles[0]
            require(title.getAttribute("ignore") == "1" and not title.childNodes, "fixture title shape")
            if mode in ("per-text-field-title-format", "per-text-format-and-replace", "partial-field-title-format"):
                style = data["charShapeId"]
                require(type(style) is int and 0 <= style <= 0xffffffff, "style ID")
                ids = {int(n.attrib["id"]) for n in ET.fromstring(before.read("Contents/header.xml")).iter("{" + H + "}charPr")}
                require(style in ids, "unknown resource ID")
                source_p = list(ET.fromstring(old_raw).iter("{" + P + "}p"))[paragraph - 1]
                _, units = shared["signature"](source_p, True, True, True)
                if mode == "partial-field-title-format":
                    require(type(data["startUnit"]) is int and type(data["endUnit"]) is int and 0 <= data["startUnit"] < data["endUnit"] <= units, "partial range")
                else:
                    require(type(data["startUnit"]) is int and type(data["endUnit"]) is int and data["startUnit"] == 0 and data["endUnit"] == units, "whole paragraph format required")
                runs = direct(target, "run")
                require(bool(runs), "source run required")
                if mode == "partial-field-title-format":
                    expected_partial_source_run(target, style, data["startUnit"], data["endUnit"])
                else:
                    format_source_runs(target, style)
                require(type(data["invalidateLineSegments"]) is bool, "explicit layout invalidation expectation")
                if data["invalidateLineSegments"]:
                    # Exact existing paragraph_continuation_metadata.remove rule,
                    # not an allow-either normalization or arbitrary subtree ignore.
                    for cache in direct(target, "linesegarray"):
                        target.removeChild(cache)
                        cache.unlink()
            if mode == "per-text-format-and-replace":
                # Test-specific independent expected operation: replacement at the
                # title boundary uses the existing left text owner, not its tail.
                title = target.getElementsByTagNameNS(P, "titleMark")[0]
                text = title.parentNode
                require(text.namespaceURI == P and text.localName == "t", "title text owner")
                require([n for n in text.childNodes if n.nodeType == Node.ELEMENT_NODE] == [title], "title-only inline shape")
                require(all(n.nodeType in (Node.TEXT_NODE, Node.ELEMENT_NODE) for n in text.childNodes), "unexpected inline nodes")
                left, right = "", ""
                seen = False
                for node in text.childNodes:
                    if node is title:
                        seen = True
                    elif not seen:
                        left += node.data
                    else:
                        right += node.data
                require(left == data["leftBefore"] and right == data["rightBefore"], "expected source title gap")
                require(type(data["inserted"]) is str and len(data["inserted"]) == 1, "single scalar insertion")
                require(type(data["deleteUnits"]) is int and data["deleteUnits"] == 1 and right and len(right[0].encode("utf-16-le")) == 2, "one BMP tail deletion")
                for node in list(text.childNodes):
                    if node is not title:
                        text.removeChild(node)
                        node.unlink()
                text.insertBefore(old.createTextNode(left + data["inserted"]), title)
                if right[1:]:
                    text.appendChild(old.createTextNode(right[1:]))
            # Only explicit requested mutations above are permitted in the ENTIRE
            # document. No paragraph clearing or ignored-target subtree exists.
            require(signature(old) == signature(new), "whole target XML differs from exact expected operation")
            return {"verified": True, "mode": mode, "wholeXmlInfoset": True,
                    "nonTargetPayloads": len(names) - 1, "zipMetadata": True}
        finally:
            old.unlink()
            new.unlink()


if __name__ == "__main__":
    print(json.dumps(verify(json.load(sys.stdin))))
