"""Source evidence for conservative unresolved-field protection, not permission."""
import json
from pathlib import Path
import re
import runpy
import sys
import xml.etree.ElementTree as ET
import zipfile

scope = runpy.run_path(str(Path(__file__).with_name("hwpx-unmatched-field-scope.py")))
P = scope["PARA"]
S = "{http://www.hancom.co.kr/hwpml/2011/section}"


def witnesses(xml):
    root = ET.fromstring(xml)
    if root.tag != S + "sec":
        raise ValueError("InvalidSectionWitnessRoot")
    report = scope["inspect_section"](xml)
    if report["link_issues"]:
        raise ValueError("AmbiguousFieldWitnessLinks")
    ids = [scope["numeric_id"](node.get("id")) for node in root.iter(P + "fieldBegin")]
    if None in ids or len(ids) != len(set(ids)):
        raise ValueError("AmbiguousFieldWitnessIds")
    nodes = list(root.iter())
    indices = {node: index for index, node in enumerate(nodes)}
    envelopes = [(entry["element"], max(indices[n] for n in nodes[entry["owner_element"]].iter()), entry["id"])
                 for entry in report["unmatched"]]
    result = []
    for paragraph, owner in enumerate(root.iter(P + "p"), 1):
        # Use only directly owned text sites. Nested table/annotation text is
        # never evidence that its containing outer paragraph is protected.
        sites = [indices[run] for run in owner.findall(P + "run") if len(run) == 0]
        sites.extend(indices[text] for run in owner.findall(P + "run") for text in run if text.tag == P + "t")
        begins = [begin for low, high, begin in envelopes if any(low <= site <= high for site in sites)]
        if begins:
            result.append({"localParagraph": paragraph, "unmatchedBeginIds": begins})
    return result


def inventory(path):
    result = []
    with zipfile.ZipFile(path) as package:
        if len(package.namelist()) != len(set(package.namelist())):
            raise ValueError("DuplicateZipEntry")
        for entry in package.infolist():
            match = re.fullmatch(r"Contents/section([0-9]+)\.xml", entry.filename)
            if not match:
                continue
            if entry.file_size > 64 * 1024 * 1024:
                raise ValueError("SectionWitnessLimit")
            xml = package.read(entry)
            if b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
                raise ValueError("UnsupportedXmlDeclaration")
            result.extend({"section": int(match[1]), **row} for row in witnesses(xml))
    return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError("ExpectedFixturePath")
    print(json.dumps(inventory(sys.argv[1])))
