"""Test-only coherent wrong cache/result, without changing formula inputs."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

request = json.load(sys.stdin)
original = zipfile.ZipFile(io.BytesIO(base64.b64decode(request["bytes"])))
part = "Contents/section0.xml"
p = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
root = ET.fromstring(original.read(part))
field = [node for node in root.iter(p + "fieldBegin") if node.get("type") == "FORMULA"][request["ordinal"]]
params = {node.get("name"): node for node in field.iter(p + "stringParam")}
display = request["display"]
params["LastResult"].text = display
params["Command"].text = params["Command"].text.rsplit(";;", 1)[0] + ";;" + display
nodes = list(root.iter())
results = []
for node in nodes[nodes.index(field) + len(list(field.iter())):]:
    if node.tag == p + "fieldEnd":
        if node.get("beginIDRef") != field.get("id"):
            raise ValueError("field pairing")
        break
    if node.tag == p + "t":
        results.append(node)
if len(results) != 1:
    raise ValueError("single result required")
results[0].text = display
output = io.BytesIO()
with zipfile.ZipFile(output, "w") as archive:
    for entry in original.infolist():
        archive.writestr(entry, ET.tostring(root, encoding="utf-8") if entry.filename == part else original.read(entry.filename))
print(base64.b64encode(output.getvalue()).decode("ascii"))
