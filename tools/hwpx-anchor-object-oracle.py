"""Independent ZIP/XML object preservation check for structural editing."""
import base64
import copy
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET


def inspect(encoded):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded))) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    objects = []
    for name, data in parts.items():
        if not name.startswith("Contents/section") or not name.endswith(".xml"):
            continue
        root = ET.fromstring(data)
        for node in root.iter():
            if node.tag not in {
                "{http://www.hancom.co.kr/hwpml/2011/paragraph}" + kind
                for kind in ("pic", "line", "footNote", "endNote", "equation")
            }:
                continue
            subtree = copy.deepcopy(node)
            subtree.tail = None
            objects.append((name, ET.tostring(subtree, encoding="unicode")))
    return parts, objects


payload = json.load(sys.stdin)
before, original = inspect(payload["before"])
after, saved = inspect(payload["after"])
if not original:
    raise ValueError("No protected object evidence")
if set(before) != set(after):
    raise ValueError("Changed ZIP part inventory")
if original != saved:
    raise ValueError("Changed object subtree or document order")
for name in before:
    if name.startswith("Contents/section") and name.endswith(".xml"):
        continue
    if before[name] != after[name]:
        raise ValueError("Changed unrelated part: " + name)
print(json.dumps({"objects": len(saved), "parts": len(after)}))
