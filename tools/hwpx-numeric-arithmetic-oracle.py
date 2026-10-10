"""Observed chart arithmetic only; not whole-section XML preservation."""
import base64
import decimal
import io
import json
from pathlib import Path
import runpy
import sys
import xml.etree.ElementTree as ET
import zipfile

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def verify(request):
    data = base64.b64decode(request["after"], validate=True)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.testzip() is not None:
            raise ValueError("ZIP CRC")
        root = ET.fromstring(archive.read("Contents/section0.xml"))
    paragraphs = list(root.iter(P + "p"))
    ordinal = request["paragraph"]
    if type(ordinal) is not int or not 1 <= ordinal <= len(paragraphs):
        raise ValueError("invalid numeric paragraph")
    target = paragraphs[request["paragraph"] - 1]
    if "".join(node.text or "" for node in target.iter(P + "t")) != request["value"]:
        raise ValueError("numeric input mismatch")
    calculate = runpy.run_path(str(Path(__file__).with_name("hwpx-formula-cell-oracle.py")))["results"]
    expected = list(calculate(io.BytesIO(data)))
    parents = {child: parent for parent in root.iter() for child in parent}
    fields = [node for node in root.iter(P + "fieldBegin") if node.get("type") == "FORMULA"]
    if len(fields) != 13 or len(expected) != 13:
        raise ValueError("formula count")
    for field, (identifier, formula, result, _) in zip(fields, expected):
        params = {node.get("name"): node.text or "" for node in field.find(P + "parameters")}
        if field.get("id") != identifier or params["Formula"] != formula:
            raise ValueError("formula identity")
        cached = decimal.Decimal(params["LastResult"].replace(",", ""))
        tolerance = max(abs(result), decimal.Decimal(1)) * decimal.Decimal("0.00001")
        if not cached.is_finite() or abs(cached - result) > tolerance:
            raise ValueError("independent arithmetic mismatch")
        owner = field
        while owner.tag != P + "p":
            owner = parents[owner]
        displayed = decimal.Decimal("".join(node.text or "" for node in owner.iter(P + "t")).replace(",", "").strip())
        if displayed != cached:
            raise ValueError("display cache mismatch")
        if params["Command"] != formula + "??" + params["ResultFormat"] + ";;" + params["LastResult"]:
            raise ValueError("command cache mismatch")
    return {"formulas": len(expected), "relativeTolerance": "0.00001"}


def self_test(request):
    verify(request)
    raw = base64.b64decode(request["after"], validate=True)
    for mode in ("cache", "display", "command"):
        with zipfile.ZipFile(io.BytesIO(raw)) as source:
            root = ET.fromstring(source.read("Contents/section0.xml"))
            field = next(node for node in root.iter(P + "fieldBegin") if node.get("type") == "FORMULA")
            params = {node.get("name"): node for node in field.find(P + "parameters")}
            if mode == "cache":
                params["LastResult"].text = "999999999"
            elif mode == "command":
                params["Command"].text = "wrong"
            else:
                parents = {child: parent for parent in root.iter() for child in parent}
                owner = field
                while owner.tag != P + "p":
                    owner = parents[owner]
                next(owner.iter(P + "t")).text = "999999999"
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w") as archive:
                for item in source.infolist():
                    archive.writestr(item, ET.tostring(root) if item.filename == "Contents/section0.xml" else source.read(item.filename))
        mutated = dict(request, after=base64.b64encode(output.getvalue()).decode())
        try:
            verify(mutated)
        except ValueError:
            continue
        raise ValueError("accepted corrupted " + mode)
    for ordinal in (0, -1, True, 999999):
        try:
            verify(dict(request, paragraph=ordinal))
        except ValueError:
            continue
        raise ValueError("accepted invalid paragraph")
    return {"rejectedMutants": 7}


if __name__ == "__main__":
    request = json.load(sys.stdin)
    if sys.argv[1:] not in ([], ["--self-test"]):
        raise ValueError("unknown arithmetic oracle argument")
    print(json.dumps(self_test(request) if sys.argv[1:] else verify(request)))
