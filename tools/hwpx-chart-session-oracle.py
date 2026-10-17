"""Independent two-copy check for public value edits; no assert shortcuts."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
import olefile
import runpy


def require(condition, message):
    if not condition:
        raise ValueError(message)


def signature(node):
    return (node.tag, sorted(node.attrib.items()), node.text, node.tail,
            [signature(child) for child in node])


def apply_expected_edit(expected, data):
    nodes = list(expected.iter())
    node = data["value_node"]
    require(type(node) is int and 0 <= node < len(nodes), "invalid expected value node")
    leaf = nodes[node]
    rich_text = data.get("kind") == "rich_text"
    expected_tag = "{http://schemas.openxmlformats.org/drawingml/2006/main}t" if rich_text else "{http://schemas.openxmlformats.org/drawingml/2006/chart}v"
    require(leaf.tag == expected_tag, "not a chart value")
    parents = {child: parent for parent in expected.iter() for child in parent}
    parent = parents[leaf]
    direct_series = data.get("kind") == "direct_series"
    if rich_text:
        drawing = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
        chart_ns = "{http://schemas.openxmlformats.org/drawingml/2006/chart}"
        require(parent.tag == drawing + "r", "not a regular DrawingML run")
        paragraph = parents.get(parent)
        rich = parents.get(paragraph)
        tx = parents.get(rich)
        owner = parents.get(tx)
        require(paragraph is not None and paragraph.tag == drawing + "p" and rich is not None and rich.tag == chart_ns + "rich" and tx is not None and tx.tag == chart_ns + "tx" and owner is not None and owner.tag in (chart_ns + "title", chart_ns + "dLbl"), "invalid rich text owner chain")
        require(len(leaf) == 0, "nested rich text leaf")
    if direct_series:
        require(parent.tag == "{http://schemas.openxmlformats.org/drawingml/2006/chart}tx" and parents[parent].tag == "{http://schemas.openxmlformats.org/drawingml/2006/chart}ser", "not a direct series name")
    container = parents[parent]
    if container.tag == "{http://schemas.openxmlformats.org/drawingml/2006/chart}lvl":
        container = parents[container]
    kinds = {"numCache": "numeric_cache", "numLit": "numeric_literal", "strCache": "string_cache", "strLit": "string_literal", "multiLvlStrCache": "multilevel_cache"}
    observed = "rich_text" if rich_text else "direct_series" if direct_series else kinds.get(container.tag.rsplit("}", 1)[-1])
    require(observed is not None, "Unknown point cache kind")
    if "kind" in data:
        require(data["kind"] == observed, "Point kind mismatch")
    leaf.text = data["value"] if observed in ("numeric_cache", "numeric_literal", "rich_text") else runpy.run_path("tools/xstring-encode-oracle.py")["encode"](data["value"])
    if leaf.text == "":
        leaf.text = None


def verify(data):
    before = zipfile.ZipFile(io.BytesIO(base64.b64decode(data["before"])))
    after = zipfile.ZipFile(io.BytesIO(base64.b64decode(data["after"])))
    require(before.namelist() == after.namelist(), "ZIP inventory mismatch")
    require(before.comment == after.comment, "ZIP comment mismatch")
    require(after.testzip() is None, "ZIP CRC mismatch")
    metadata = ("filename", "date_time", "compress_type", "flag_bits", "create_system", "create_version", "extract_version", "internal_attr", "external_attr", "extra", "comment")
    for old, new in zip(before.infolist(), after.infolist()):
        require(all(getattr(old, field) == getattr(new, field) for field in metadata), "ZIP entry metadata mismatch")
    chart, ole = data["chart"], data["ole"]
    expected = ET.fromstring(before.read(chart))
    edits = data.get("edits", [data])
    require(type(edits) is list, "invalid expected edit list")
    if "edits" in data:
        require(not any(key in data for key in ("value_node", "kind", "value")), "ambiguous expected edits")
    seen = set()
    for edit in edits:
        require(type(edit) is dict, "invalid expected edit")
        node = edit.get("value_node")
        require(type(node) is int and node >= 0, "invalid expected value node")
        require(node not in seen, "duplicate expected edit")
        seen.add(node)
        apply_expected_edit(expected, edit)
    require(signature(expected) == signature(ET.fromstring(after.read(chart))), "chart XML mismatch")
    for path in before.namelist():
        if path not in (chart, ole):
            require(before.read(path) == after.read(path), "non-target ZIP payload mismatch")
    def open_ole(payload):
        if not payload.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
            require(int.from_bytes(payload[:4], "little") == len(payload) - 4, "OLE envelope mismatch")
            payload = payload[4:]
        return olefile.OleFileIO(io.BytesIO(payload))
    with open_ole(before.read(ole)) as old, open_ole(after.read(ole)) as new:
        require(old.listdir(streams=True, storages=True) == new.listdir(streams=True, storages=True), "OLE inventory mismatch")
        require(old.dll_version == new.dll_version, "OLE version mismatch")
        def entries(container):
            paths = [[]] + container.listdir(streams=True, storages=True)
            return {tuple(path): container.direntries[0 if not path else container._find(path)] for path in paths}
        old_entries, new_entries = entries(old), entries(new)
        require(old_entries.keys() == new_entries.keys(), "OLE entry inventory mismatch")
        for path, entry in old_entries.items():
            other = new_entries[path]
            for field in ("name", "entry_type", "clsid", "dwUserFlags", "createTime", "modifyTime"):
                desired = getattr(entry, field)
                if not path and field == "createTime" and data.get("allow_root_creation_zero") is True:
                    desired = 0
                require(getattr(other, field) == desired, "OLE entry metadata mismatch")
        for path in old.listdir():
            actual = new.openstream(path).read()
            desired = after.read(chart) if path == ["OOXMLChartContents"] else old.openstream(path).read()
            require(actual == desired, "OLE stream mismatch")


if __name__ == "__main__":
    verify(json.load(sys.stdin))
