"""Independent exact semantic transformation check for the native save survey."""
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


def parse(raw):
    return E.fromstring(raw, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))


def shape(node):
    return (node.tag, sorted(node.attrib.items()), node.text, node.tail, [shape(child) for child in node])


def verify(before, after):
    with zipfile.ZipFile(io.BytesIO(before)) as original, zipfile.ZipFile(io.BytesIO(after)) as saved:
        require(original.testzip() is None and saved.testzip() is None, "invalid ZIP CRC")
        require(original.namelist() == saved.namelist(), "ZIP inventory/order changed")
        part = "Contents/section0.xml"
        for name in original.namelist():
            if name != part:
                require(original.read(name) == saved.read(name), "unselected ZIP payload changed: " + name)
        left, right = parse(original.read(part)), parse(saved.read(part))
        parents = {child: parent for parent in right.iter() for child in parent}
        tables = [node for node in right.iter(P + "tbl") if node.get("id") == "33"]
        require(len(tables) == 1, "missing or duplicate created table")
        table = tables[0]
        require(table.attrib == {"id": "33", "zOrder": "0", "numberingType": "TABLE", "textWrap": "TOP_AND_BOTTOM", "textFlow": "BOTH_SIDES", "lock": "0", "dropcapstyle": "None", "pageBreak": "CELL", "repeatHeader": "0", "rowCnt": "2", "colCnt": "2", "cellSpacing": "0", "borderFillIDRef": "1", "noAdjust": "0"}, "wrong table attributes")
        require([node.tag for node in table] == [P + name for name in ("sz", "pos", "outMargin", "inMargin", "tr", "tr")], "wrong table child inventory")
        require(table.get("rowCnt") == "2" and table.get("colCnt") == "2", "wrong table grid")
        size = table.find(P + "sz")
        require(size is not None and size.get("width") == "101" and size.get("height") == "34", "wrong total dimensions")
        cells = [cell for row in table.findall(P + "tr") for cell in row.findall(P + "tc")]
        require(len(cells) == 4, "wrong cell count")
        for index, cell in enumerate(cells):
            require(cell.attrib == {"name": "", "header": "0", "hasMargin": "0", "protect": "0", "editable": "0", "dirty": "0", "borderFillIDRef": "1"}, "wrong cell attributes")
            require([node.tag for node in cell] == [P + name for name in ("subList", "cellAddr", "cellSpan", "cellSz", "cellMargin")], "wrong cell children")
            address, span, dimensions = (cell.find(P + name) for name in ("cellAddr", "cellSpan", "cellSz"))
            require(address is not None and address.attrib == {"rowAddr": str(index // 2), "colAddr": str(index % 2)}, "wrong cell address")
            require(span is not None and span.attrib == {"rowSpan": "1", "colSpan": "1"}, "wrong cell span")
            require(dimensions is not None and dimensions.attrib == {"width": "51" if index % 2 == 0 else "50", "height": "17"}, "wrong cell dimensions")
            paragraphs = cell.findall(P + "subList/" + P + "p")
            require(len(paragraphs) == 1, "wrong cell paragraph ownership")
            paragraph = paragraphs[0]
            require(paragraph.get("id") == str(1000000 + index), "wrong cell paragraph ID")
            require(paragraph.get("paraPrIDRef") == "1" and paragraph.get("styleIDRef") == "0", "wrong cell style")
            runs = paragraph.findall(P + "run")
            require(len(runs) == 1 and runs[0].get("charPrIDRef") == "1", "wrong character reference")
            text = "".join((node.text or "") for node in runs[0].findall(P + "t"))
            require(text == ("셀😀<&\r" if index == 0 else ""), "wrong cell Unicode text")
        run = parents[table]
        host = parents[run]
        require(run.tag == P + "run" and list(run) == [table], "table must own one direct run")
        require(host is list(right.iter(P + "p"))[1], "wrong host paragraph")
        siblings = list(host)
        position = siblings.index(run)
        require(position > 0 and position + 1 < len(siblings), "missing split host runs")
        first, last = siblings[position - 1], siblings[position + 1]
        require(first.tag == last.tag == P + "run" and first.attrib == last.attrib == run.attrib, "host run attributes changed")
        require(len(first) == 1 and first[0].tag == P + "t" and first[0].text in (None, ""), "nonempty prefix at zero insertion")
        require(len(last) >= 1 and last[0].tag == P + "t" and first[0].attrib == last[0].attrib, "wrong restored text wrapper")
        first[0].text = last[0].text
        for child in list(last[0]):
            first[0].append(child)
        first[0].tail = last[0].tail
        for child in list(last)[1:]:
            first.append(child)
        first.tail = last.tail
        host.remove(run)
        host.remove(last)
        original_host = list(left.iter(P + "p"))[1]
        for cache in list(original_host):
            if cache.tag == P + "linesegarray":
                original_host.remove(cache)
        require(shape(left) == shape(right), "non-table section content changed")


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    verify(base64.b64decode(payload["before"], validate=True), base64.b64decode(payload["after"], validate=True))
    print(json.dumps({"verified": True, "cells": 4, "scope": "one native save fixture, full outside XML and ZIP payload preservation"}))
