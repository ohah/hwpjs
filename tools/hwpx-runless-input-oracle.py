"""Independent whole-XML expectation for one originally runless paragraph."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as E


def require(condition, message):
    if not condition:
        raise ValueError(message)


def parse(data):
    return E.fromstring(data, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True, insert_pis=True)))


request = json.load(sys.stdin)
before, after = [zipfile.ZipFile(io.BytesIO(base64.b64decode(request[key], validate=True))) for key in ("before", "after")]
require(before.namelist() == after.namelist(), "ZIP inventory changed")
require(len(set(before.namelist())) == len(before.namelist()), "Duplicate ZIP names")
require(before.comment == after.comment, "ZIP comment changed")
section = request["section"]
paragraph_index = request["localParagraph"]
require(type(section) is int and section >= 0, "Invalid section")
require(type(paragraph_index) is int and paragraph_index >= 0, "Invalid paragraph")
require(type(request["text"]) is str, "Invalid text")
path = f"Contents/section{section}.xml"
hp = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
hh = "{http://www.hancom.co.kr/hwpml/2011/head}"
root = parse(before.read(path))
paragraphs = list(root.iter(hp + "p"))
require(paragraph_index < len(paragraphs), "Paragraph outside source")
paragraph = paragraphs[paragraph_index]
require(all(child.tag == hp + "linesegarray" for child in paragraph), "Source is not runless")
require(not (paragraph.text or "").strip(), "Opaque paragraph text")
style_id = paragraph.attrib.get("styleIDRef")
require(style_id is not None, "Missing paragraph style")
header = parse(before.read("Contents/header.xml"))
styles = [style for style in header.findall(hh + "refList/" + hh + "styles/" + hh + "style") if style.get("id") == style_id]
require(len(styles) == 1, "Missing or ambiguous style")
character_id = styles[0].get("charPrIDRef")
require(character_id is not None, "Missing character reference")
characters = header.findall(hh + "refList/" + hh + "charProperties/" + hh + "charPr")
require(sum(shape.get("id") == character_id for shape in characters) == 1, "Invalid character reference")
tails = "".join(child.tail or "" for child in paragraph)
for child in list(paragraph):
    paragraph.remove(child)
run = E.Element(hp + "run", {"charPrIDRef": character_id})
text = E.SubElement(run, hp + "t")
text.text = request["text"] or None
run.tail = tails or None
paragraph.insert(0, run)
require(E.tostring(root) == E.tostring(parse(after.read(path))), "Complete XML mismatch")
for name in before.namelist():
    if name != path:
        require(before.read(name) == after.read(name), "Non-target ZIP payload changed: " + name)
print(json.dumps({"verified": True, "characterId": character_id}))
