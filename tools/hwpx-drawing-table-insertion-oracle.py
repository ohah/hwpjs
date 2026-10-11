"""Exact outside-table semantic proof for shapeline's two direct line anchors."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as E

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def shape(node):
    return (node.tag, sorted(node.attrib.items()), node.text, node.tail, [shape(c) for c in node])


def host_shape(host):
    children = []
    for node in host:
        if node.tag == P + "linesegarray":
            continue
        require(node.tag == P + "run" and node.text is None and node.tail is None, "Unexpected host wrapper")
        require(node.attrib == {"charPrIDRef": "1"}, "Host run attributes changed")
        for child in node:
            if child.tag == P + "t" and not child.attrib and len(child) == 0 and child.text in (None, "") and child.tail is None:
                continue
            children.append((sorted(node.attrib.items()), shape(child)))
    return (sorted(host.attrib.items()), host.text, host.tail, children)


def verify(data):
    unit = data["unit"]
    require(type(unit) is int and 0 <= unit <= 2, "Invalid anchor unit")
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data["before"], validate=True))) as left, zipfile.ZipFile(io.BytesIO(base64.b64decode(data["after"], validate=True))) as right:
        require(left.testzip() is None and right.testzip() is None, "Invalid ZIP CRC")
        require(left.namelist() == right.namelist(), "ZIP inventory changed")
        part = "Contents/section0.xml"
        for a, b in zip(left.infolist(), right.infolist()):
            for key in ("filename", "date_time", "compress_type", "comment", "extra", "external_attr", "internal_attr", "create_system"):
                require(getattr(a, key) == getattr(b, key), "ZIP metadata changed")
            if a.filename != part:
                require(left.read(a.filename) == right.read(b.filename), "Outside ZIP payload changed")
        parse = lambda raw: E.fromstring(raw, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))
        old, new = parse(left.read(part)), parse(right.read(part))
        require(len(old) == len(new) == 1 and old[0].tag == new[0].tag == P + "p", "Unexpected section layout")
        require(old.tag == new.tag and old.attrib == new.attrib and old.text == new.text and old.tail == new.tail, "Section changed")
        require(not new[0].findall(P + "linesegarray"), "Stale host line cache")
        original = [c for run in old[0] for c in run if c.tag == P + "line"]
        require(len(original) == 2, "Unexpected original anchors")
        anchors = [c for run in new[0] for c in run if c.tag in (P + "line", P + "tbl")]
        require([n.tag for n in anchors] == [P + "line"] * unit + [P + "tbl"] + [P + "line"] * (2 - unit), "Wrong table anchor order")
        table = anchors[unit]
        require(table.get("id") == str(data["table_id"]) and table.get("rowCnt") == table.get("colCnt") == "1", "Wrong generated table")
        require(len(table.findall(P + "tr/" + P + "tc")) == 1, "Wrong cell count")
        for run in new[0]:
            if table in list(run):
                run.remove(table)
        require(host_shape(old[0]) == host_shape(new[0]), "Outside table XML changed")


if __name__ == "__main__":
    verify(json.load(sys.stdin))
    print(json.dumps({"verified": True, "scope": "shapeline direct anchor order and outside-table XML ZIP"}))
