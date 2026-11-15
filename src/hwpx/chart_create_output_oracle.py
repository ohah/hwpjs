"""Independent stdlib output oracle; never invokes Native or the serializer.

stdin: {"xml_base64": "...", "expected": {"chart": {...}, "data": {...}}}.
Expected is authored by the caller, never inferred from output. For actual
post-grant artifacts additionally pass --schema /official/transitional/dml-chart.xsd
(complete official schema directory; requires lxml). No schema fallback/skip.
Both ordinary Python and python -O reject wrong outputs: no assert statements.
This checks explicit-profile output. Legacy has its own fixed byte oracle.
"""
import argparse
import base64
import json
import math
from decimal import Decimal
import re
import sys
import xml.etree.ElementTree as ET

URI = "http://schemas.openxmlformats.org/drawingml/2006/chart"
C = "{" + URI + "}"
KINDS = set("areaChart area3DChart lineChart line3DChart stockChart radarChart scatterChart pieChart pie3DChart doughnutChart barChart bar3DChart ofPieChart surfaceChart surface3DChart bubbleChart".split())
PIE = {"pieChart", "pie3DChart", "doughnutChart", "ofPieChart"}
DEPTH = {"bar3DChart", "line3DChart", "area3DChart", "surfaceChart", "surface3DChart"}
OPTIONS = {"bar_direction": "barDir", "grouping": "grouping", "scatter_style": "scatterStyle", "radar_style": "radarStyle", "of_pie_type": "ofPieType", "wireframe": "wireframe"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def children(node, name):
    return node.findall(C + name)


def one(node, name):
    values = children(node, name)
    require(len(values) == 1, "expected one " + name)
    return values[0]


def option(node, name, expected):
    require(one(node, name).attrib == {"val": str(expected)}, "wrong " + name)


def text(node):
    require(len(node) == 0, "unexpected nested text markup")
    raw = node.text or ""
    decoded = re.sub(r"_x([0-9a-fA-F]{4})_", lambda m: chr(int(m[1], 16)), raw)
    return decoded.encode("utf-16-le", "surrogatepass").decode("utf-16-le")


def literal(ser, role, expected, strings=False):
    parent = one(ser, role)
    require(len(parent) == 1, "unexpected data reference or competing literal")
    cache = one(parent, "strLit" if strings else "numLit")
    option(cache, "ptCount", len(expected))
    points = children(cache, "pt")
    require(len(points) == len(expected), "point count")
    for index, (point, value) in enumerate(zip(points, expected)):
        require(point.attrib == {"idx": str(index)}, "point order/index")
        leaf = one(point, "v")
        require(len(point) == 1, "competing point contents")
        actual = text(leaf) if strings else leaf.text
        require(actual == value, "wrong lexical value for " + role)


def check_admission(expected):
    """Independent exact Decimal product-policy oracle, not XSD validation."""
    kind, data = expected["chart"]["kind"], expected["data"]
    def exact(raw):
        require(isinstance(raw, str) and len(raw) <= 128, "numeric lexical bound")
        match = re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE]([+-]?[0-9]+))?", raw)
        require(match is not None, "numeric grammar")
        require(abs(int(match[1] or "0")) <= 10000, "explicit decimal exponent bound")
        require(math.isfinite(float(raw)), "finite-f64 input policy")
        return Decimal(raw)
    rows = data["series"]
    for row in rows:
        for key in ("values", "x_values", "bubble_sizes"):
            if key not in row:
                continue
            for raw in row[key]:
                value = exact(raw)
                if key == "bubble_sizes" or (key == "values" and kind in PIE):
                    require(value >= Decimal(0), "negative authored nonzero value")
    if kind == "stockChart":
        ohlc = expected["chart"]["stock_layout"] == "openHighLowClose"
        roles = ["open", "high", "low", "close"] if ohlc else ["high", "low", "close"]
        require([r["stock_role"] for r in rows] == roles, "stock roles")
        by_role = {r["stock_role"]: r for r in rows}
        for index in range(len(data["categories"])):
            high, low, close = (exact(by_role[k]["values"][index]) for k in ("high", "low", "close"))
            opening = exact(by_role["open"]["values"][index]) if ohlc else close
            require(low <= close <= high and low <= opening <= high, "exact authored OHLC order")


def check(xml, expected, schema=None):
    require(len(xml) <= 8 * 1024 * 1024, "XML limit")
    require(b"<!DOCTYPE" not in xml.upper() and b"<!ENTITY" not in xml.upper(), "DTD")
    if schema:
        from lxml import etree
        parser = etree.XMLParser(resolve_entities=False, no_network=True)
        validator = etree.XMLSchema(etree.parse(schema, parser))
        validator.assertValid(etree.fromstring(xml, parser))
    root = ET.fromstring(xml)
    require(root.tag == C + "chartSpace", "chartSpace namespace")
    check_admission(expected)
    p, data = expected["chart"], expected["data"]
    kind = p["kind"]
    require(kind in KINDS, "unknown expected kind")
    chart = one(root, "chart")
    area = one(chart, "plotArea")
    plots = [e for e in area if e.tag.removeprefix(C) in KINDS]
    require(len(plots) == 1 and plots[0].tag == C + kind, "wrong plot kind")
    plot = plots[0]
    for key, tag in OPTIONS.items():
        if key in p:
            value = p[key]
            option(plot, tag, int(value) if isinstance(value, bool) else value)
        else:
            require(not children(plot, tag), "irrelevant plot option " + tag)
    series = children(plot, "ser")
    require(len(series) == len(data["series"]), "series count")
    xy = kind in {"scatterChart", "bubbleChart"}
    for index, (ser, values) in enumerate(zip(series, data["series"])):
        option(ser, "idx", index)
        option(ser, "order", index)
        require(text(one(one(ser, "tx"), "v")) == values["name"], "series name")
        roles = {"xVal", "yVal", "bubbleSize"} if xy else {"cat", "val"}
        if kind != "bubbleChart":
            roles.discard("bubbleSize")
        actual_roles = {e.tag.removeprefix(C) for e in ser} & {"cat", "val", "xVal", "yVal", "bubbleSize"}
        require(actual_roles == roles, "wrong data roles")
        if xy:
            literal(ser, "xVal", values["x_values"])
            literal(ser, "yVal", values["values"])
            if kind == "bubbleChart":
                literal(ser, "bubbleSize", values["bubble_sizes"])
        else:
            literal(ser, "cat", data["categories"], strings=True)
            literal(ser, "val", values["values"])
    ids = [e.attrib.get("val") for e in children(plot, "axId")]
    expected_ids = [] if kind in PIE else ["1", "2", "3"] if kind in DEPTH else ["1", "2"]
    require(ids == expected_ids, "plot axis IDs")
    axes = [e for e in area if e.tag in {C + "catAx", C + "valAx", C + "serAx", C + "dateAx"}]
    require(len(axes) == len(ids), "axis count")
    horizontal = p.get("bar_direction") == "bar"
    for index, axis in enumerate(axes):
        name = "serAx" if index == 2 else "valAx" if xy or index == 1 else "catAx"
        require(axis.tag == C + name, "axis type")
        option(axis, "axId", str(index + 1))
        option(axis, "crossAx", "1" if index == 1 else "2")
        position = "b" if index == 2 else ("l" if horizontal else "b") if index == 0 else ("b" if horizontal else "l")
        option(axis, "axPos", position)
    require(len(children(chart, "view3D")) == int(kind.endswith("3DChart")), "3D view")
    if kind.endswith("3DChart"):
        view = one(chart, "view3D")
        for key, value in {"rotX": 30 if kind == "pie3DChart" else 15,
                           "hPercent": 100, "rotY": 0 if kind == "pie3DChart" else 20,
                           "depthPercent": 100, "rAngAx": 0 if kind == "pie3DChart" else 1}.items():
            option(view, key, value)
        if kind == "pie3DChart":
            option(view, "perspective", 30)
        else:
            require(not children(view, "perspective"), "unexpected perspective policy")
    if kind in {"bar3DChart", "line3DChart", "area3DChart"}:
        option(plot, "gapDepth", 150)
    if kind == "bar3DChart":
        option(plot, "shape", "box")
    if kind in {"surfaceChart", "surface3DChart"}:
        require(not children(plot, "gapDepth"), "surface has no gapDepth vocabulary")
    if kind == "doughnutChart":
        option(plot, "holeSize", 50)
    if kind == "bubbleChart":
        for key, value in {"bubble3D": 0, "bubbleScale": 100, "showNegBubbles": 0, "sizeRepresents": "area"}.items():
            option(plot, key, value)
    require(not any(e.tag in {C + "externalData", C + "f", C + "numRef", C + "strRef"} for e in root.iter()), "external/reference data")
    if kind == "stockChart":
        roles = [s["stock_role"] for s in data["series"]]
        require(roles == (["open", "high", "low", "close"] if p["stock_layout"] == "openHighLowClose" else ["high", "low", "close"]), "stock roles")
        one(plot, "hiLowLines")
        require(len(children(plot, "upDownBars")) == int(len(roles) == 4), "OHLC bars")
    return {"kind": kind, "series": len(series), "axes": len(axes)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema")
    args = parser.parse_args()
    packet = json.load(sys.stdin)
    print(json.dumps(check(base64.b64decode(packet["xml_base64"], validate=True), packet["expected"], args.schema)))
