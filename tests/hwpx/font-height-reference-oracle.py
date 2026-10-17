"""Stored HWPX font/run heights, independent of display snapshots."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
H = "{http://www.hancom.co.kr/hwpml/2011/head}"
P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
with zipfile.ZipFile(sys.argv[1]) as archive:
    header = ET.fromstring(archive.read("Contents/header.xml"))
    shapes = [{"id": int(e.attrib["id"]), "height": int(e.attrib["height"])} for e in header.findall(H + "refList/" + H + "charProperties/" + H + "charPr")]
    lines = []
    for name in sorted(archive.namelist()):
        if not name.startswith("Contents/section") or not name.endswith(".xml"):
            continue
        root = ET.fromstring(archive.read(name))
        for paragraph in root.iter(P + "p"):
            ids = [int(run.attrib["charPrIDRef"]) for run in paragraph.findall(P + "run")]
            for segment in paragraph.findall(P + "linesegarray/" + P + "lineseg"):
                lines.append({"height": int(segment.attrib["textheight"]), "ids": ids})
print(json.dumps({"shapes": shapes, "lines": lines}))
