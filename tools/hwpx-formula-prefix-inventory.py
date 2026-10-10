"""Read-only source witness for formula fields at paragraph position zero."""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def paragraphs_with_formula_prefix(root):
    result = []
    for ordinal, paragraph in enumerate(root.iter(HP + "p"), 1):
        text_seen = False
        formula_prefix = False

        def visit(node):
            nonlocal text_seen, formula_prefix
            if node is not paragraph and node.tag == HP + "p":
                return
            if node.tag == HP + "fieldBegin":
                if node.get("type") == "FORMULA" and not text_seen:
                    formula_prefix = True
            if node.tag == HP + "t" and (node.text or len(node)):
                text_seen = True
            for child in node:
                visit(child)

        visit(paragraph)
        if formula_prefix:
            result.append(ordinal)
    return result


def inventory(path):
    rows = []
    with zipfile.ZipFile(path) as package:
        names = package.namelist()
        if len(set(names)) != len(names):
            raise ValueError("DuplicateZipEntry")
        for name in names:
            match = re.fullmatch(r"Contents/section([0-9]+)\.xml", name)
            if not match:
                continue
            if package.getinfo(name).file_size > 64 * 1024 * 1024:
                raise ValueError("SectionWitnessLimit")
            raw = package.read(name)
            if b"<!DOCTYPE" in raw or b"<!ENTITY" in raw:
                raise ValueError("UnsupportedXmlDeclaration")
            for paragraph in paragraphs_with_formula_prefix(ET.fromstring(raw)):
                rows.append({"section": int(match[1]), "localParagraph": paragraph})
    return rows


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError("ExpectedFixturePath")
    print(json.dumps(inventory(sys.argv[1])))
