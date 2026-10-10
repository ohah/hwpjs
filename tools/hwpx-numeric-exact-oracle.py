"""Exact formatted chart result strings, separate from tolerance diagnostics."""
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
    base = Path(__file__).parent
    runpy.run_path(str(base / "hwpx-numeric-arithmetic-oracle.py"))["verify"](request)
    data = base64.b64decode(request["after"], validate=True)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        root = ET.fromstring(archive.read("Contents/section0.xml"))
    calculate = runpy.run_path(str(base / "hwpx-formula-cell-oracle.py"))["results"]
    expected = list(calculate(io.BytesIO(data)))
    parents = {child: parent for parent in root.iter() for child in parent}
    fields = [node for node in root.iter(P + "fieldBegin") if node.get("type") == "FORMULA"]
    for field, (identifier, formula, value, _) in zip(fields, expected):
        params = {node.get("name"): node.text or "" for node in field.find(P + "parameters")}
        if params["ResultFormat"] == "%g,":
            rendered = format(float(value), ",.6g")
        elif params["ResultFormat"] == "%.2f,":
            rendered = format(float(value), ",.2f")
        else:
            raise ValueError("UncoveredExactResultFormat")
        if params["LastResult"] != rendered:
            raise ValueError("exact result spelling mismatch")
        owner = field
        while owner.tag != P + "p":
            owner = parents[owner]
        displayed = "".join(node.text or "" for node in owner.iter(P + "t"))
        if displayed != rendered:
            raise ValueError("exact displayed spelling mismatch")
    return {"formulas": len(expected), "comparison": "exact formatted strings"}


def self_test(request):
    verify(request)
    raw = base64.b64decode(request["after"], validate=True)
    with zipfile.ZipFile(io.BytesIO(raw)) as source:
        root = ET.fromstring(source.read("Contents/section0.xml"))
        parents = {child: parent for parent in root.iter() for child in parent}
        field = next(node for node in root.iter(P + "fieldBegin") if node.get("type") == "FORMULA")
        params = {node.get("name"): node for node in field.find(P + "parameters")}
        original = decimal.Decimal(params["LastResult"].text.replace(",", ""))
        changed = str(original + decimal.Decimal("0.000001"))
        params["LastResult"].text = changed
        params["Command"].text = params["Formula"].text + "??" + params["ResultFormat"].text + ";;" + changed
        owner = field
        while owner.tag != P + "p":
            owner = parents[owner]
        texts = list(owner.iter(P + "t"))
        texts[0].text = changed
        for node in texts[1:]:
            node.text = ""
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            for item in source.infolist():
                archive.writestr(item, ET.tostring(root) if item.filename == "Contents/section0.xml" else source.read(item.filename))
    mutated = dict(request, after=base64.b64encode(output.getvalue()).decode())
    runpy.run_path(str(Path(__file__).with_name("hwpx-numeric-arithmetic-oracle.py")))["verify"](mutated)
    try:
        verify(mutated)
    except ValueError as error:
        if str(error) == "exact result spelling mismatch":
            return {"rejectedNearMutants": 1, "toleranceOracleAccepted": True}
        raise
    raise ValueError("accepted near-value corrupted cache display and command")


if __name__ == "__main__":
    if sys.argv[1:] not in ([], ["--self-test"]):
        raise ValueError("UnexpectedExactOracleArgument")
    request = json.load(sys.stdin)
    print(json.dumps(self_test(request) if sys.argv[1:] else verify(request)))
