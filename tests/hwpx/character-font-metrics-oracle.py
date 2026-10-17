"""Independent source XML values. Do not apply schema defaults."""
import json
import io
import sys
import zipfile
import xml.etree.ElementTree as ET
H = "{http://www.hancom.co.kr/hwpml/2011/head}"
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()) if sys.argv[1] == "-" else sys.argv[1]) as archive:
    root = ET.fromstring(archive.read("Contents/header.xml"))
languages = ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"]
rows = []
for shape in root.findall(H + "refList/" + H + "charProperties/" + H + "charPr"):
    values = {}
    for field, tag in [("ratio", "ratio"), ("spacing", "spacing"), ("relativeSize", "relSz"), ("offset", "offset")]:
        element = shape.find(H + tag)
        values[field] = None if element is None else [int(element.attrib[key]) if key in element.attrib else None for key in languages]
    rows.append({"id": int(shape.attrib["id"]), "values": values})
print(json.dumps(sorted(rows, key=lambda row: row["id"])))
