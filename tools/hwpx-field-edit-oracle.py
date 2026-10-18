"""Independent whole XML/ZIP oracle for a field-label prefix transaction."""
import base64
import io
import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from hwpx_field_prefix_site import leading_object_site
from hwpx_field_dirty_owners import mark_dirty_owners

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def fragments(tree):
    elements = list(tree.iter())
    paragraphs = list(tree.iter(P + "p"))
    parents = {child: parent for parent in tree.iter() for child in parent}
    result = []
    for start, begin in enumerate(elements):
        if begin.tag != P + "fieldBegin" or begin.get("type") not in ("HYPERLINK", "CLICK_HERE"):
            continue
        ends = [index for index in range(start + 1, len(elements)) if elements[index].tag == P + "fieldEnd" and elements[index].get("beginIDRef") == begin.get("id")]
        if len(ends) != 1:
            raise ValueError("Ambiguous field end")
        seen = set()
        for text in elements[start + 1:ends[0]]:
            if text.tag != P + "t" and not (text.tag == P + "run" and len(text) == 0):
                continue
            owner = parents.get(text)
            while owner is not None and owner.tag != P + "p":
                owner = parents.get(owner)
            paragraph = paragraphs.index(owner) + 1 if owner is not None else None
            if paragraph not in seen:
                result.append((begin, paragraph, text))
                seen.add(paragraph)
    return result


def compare(before, after, prefix, begin_id=None, paragraph=None, at_unit=0, deleted_units=0):
    if type(at_unit) is not int or at_unit < 0:
        raise ValueError("Invalid insertion position")
    if type(deleted_units) is not int or deleted_units < 0:
        raise ValueError("Invalid deletion length")
    with zipfile.ZipFile(io.BytesIO(before)) as original, zipfile.ZipFile(io.BytesIO(after)) as current:
        if original.namelist() != current.namelist() or len(set(original.namelist())) != len(original.namelist()) or original.comment != current.comment or original.testzip() is not None or current.testzip() is not None:
            raise ValueError("ZIP inventory or integrity changed")
        edited = False
        for entry in original.infolist():
            saved_entry = current.getinfo(entry.filename)
            for field in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                if getattr(entry, field) != getattr(saved_entry, field):
                    raise ValueError("ZIP metadata changed")
            old = original.read(entry.filename)
            new = current.read(entry.filename)
            if old == new:
                continue
            if not entry.filename.startswith("Contents/section") or not entry.filename.endswith(".xml") or edited:
                raise ValueError("Non-target ZIP payload changed")
            parser = lambda: ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
            expected = ET.fromstring(old, parser=parser())
            actual = ET.fromstring(new, parser=parser())
            choices = [(begin, owner, text) for begin, owner, text in fragments(expected) if
                       (begin_id is None or begin.get("id") == begin_id) and
                       (paragraph is None or owner == paragraph)]
            if not choices or ((begin_id is not None or paragraph is not None) and len(choices) != 1):
                raise ValueError("Unknown or ambiguous chosen field fragment")
            begin, _, text = choices[0]
            mark_dirty_owners(expected, begin)
            if at_unit == 0 and deleted_units == 0:
                text = leading_object_site(expected, begin, text)
            if text.tag == P + "run":
                text = ET.SubElement(text, P + "t")
            encoded = (text.text or "").encode("utf-16-le")
            if (at_unit + deleted_units) * 2 > len(encoded):
                raise ValueError("Insertion exceeds selected source text site")
            text.text = encoded[:at_unit * 2].decode("utf-16-le") + prefix + encoded[(at_unit + deleted_units) * 2:].decode("utf-16-le")
            if ET.tostring(expected) != ET.tostring(actual):
                raise ValueError("Unexpected XML change outside the chosen field prefix")
            edited = True
        if not edited:
            raise ValueError("Field edit was not saved")


def self_test():
    def archive(xml, other=b"keep"):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as target:
            target.writestr("Contents/section0.xml", xml)
            target.writestr("Contents/header.xml", other)
        return output.getvalue()
    xml = b"<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:fieldBegin id='7' type='HYPERLINK' dirty='0'/><p:run charPrIDRef='3'><p:t>A</p:t></p:run><p:fieldEnd beginIDRef='7'/></r>"
    valid = xml.replace(b"dirty='0'", b"dirty='1'").replace(b">A<", b">X&lt;&amp;A<")
    original = archive(xml)
    compare(original, archive(valid), "X<&")
    altered = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(archive(valid))) as source, zipfile.ZipFile(altered, "w") as target:
        for entry in source.infolist():
            if entry.filename == "Contents/header.xml":
                entry.comment = b"unexpected"
            target.writestr(entry, source.read(entry.filename))
    try:
        compare(original, altered.getvalue(), "X<&")
    except ValueError as error:
        if str(error) != "ZIP metadata changed":
            raise
    else:
        raise ValueError("Oracle accepted ZIP metadata mutation")
    empty_xml = b"<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>first</p:t></p:run></p:p><p:p><p:run charPrIDRef='9'/></p:p><p:p><p:run><p:t>last</p:t><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl></p:run></p:p></r>"
    empty_saved = empty_xml.replace(b"dirty='0'", b"dirty='1'").replace(b"<p:run charPrIDRef='9'/>", b"<p:run charPrIDRef='9'><p:t>X</p:t></p:run>")
    compare(archive(empty_xml), archive(empty_saved), "X", begin_id="8", paragraph=2)
    try:
        compare(archive(empty_xml), archive(empty_saved), "wrong", begin_id="8", paragraph=2)
    except ValueError:
        pass
    else:
        raise ValueError("Oracle accepted wrong empty-run text")
    unicode_xml = xml.replace(b">A<", ">A😀B<".encode())
    unicode_saved = unicode_xml.replace(b"dirty='0'", b"dirty='1'").replace(">A😀B<".encode(), ">AX😀B<".encode())
    compare(archive(unicode_xml), archive(unicode_saved), "X", at_unit=1)
    replaced = unicode_xml.replace(b"dirty='0'", b"dirty='1'").replace(">A😀B<".encode(), b">AXB<")
    compare(archive(unicode_xml), archive(replaced), "X", at_unit=1, deleted_units=2)
    deleted = unicode_xml.replace(b"dirty='0'", b"dirty='1'").replace(">A😀B<".encode(), b">AB<")
    compare(archive(unicode_xml), archive(deleted), "", at_unit=1, deleted_units=2)
    for invalid in (-1, True, 0, 1, 3, 100):
        try:
            compare(archive(unicode_xml), archive(replaced), "X", at_unit=1, deleted_units=invalid)
        except ValueError:
            continue
        raise ValueError("Oracle accepted invalid UTF16 deletion length")
    for invalid in (-1, True, 2, 100):
        try:
            compare(archive(unicode_xml), archive(unicode_saved), "X", at_unit=invalid)
        except ValueError:
            continue
        raise ValueError("Oracle accepted invalid UTF16 insertion position")
    for mutant in (original, archive(valid.replace(b"dirty='1'", b"dirty='0'")), archive(valid.replace(b"charPrIDRef='3'", b"charPrIDRef='4'")), archive(valid.replace(b"&amp;A", b"&amp;B")), archive(valid, b"changed")):
        try:
            compare(original, mutant, "X<&")
        except ValueError:
            continue
        raise ValueError("Oracle accepted a corrupted field edit")


if __name__ == "__main__" and "--self-test" in sys.argv:
    self_test()
    print("Independent field oracle: prefix, UTF16 insertion/replacement/deletion, invalid positions and five corruptions verified")
elif __name__ == "__main__":
    payload = json.load(sys.stdin)
    if payload.get("mode") == "inventory":
        inventory = []
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(payload["before"]))) as source:
            for name in source.namelist():
                if name.startswith("Contents/section") and name.endswith(".xml"):
                    root = ET.fromstring(source.read(name))
                    indices = {node: index for index, node in enumerate(root.iter())}
                    inventory.extend({"part": name, "beginId": begin.get("id"), "beginElement": indices[begin], "paragraph": paragraph} for begin, paragraph, _ in fragments(root))
        print(json.dumps(inventory))
    else:
        if payload.get("mode") not in (None, "prefix", "insert", "replace"):
            raise ValueError("Unknown field oracle mode")
        compare(base64.b64decode(payload["before"]), base64.b64decode(payload["after"]), payload["text"], payload.get("beginId"), payload.get("paragraph"), payload.get("atUnit", 0), payload.get("deletedUnits", 0))
        print("Independent field edit: complete XML and non-target ZIP payloads verified")
