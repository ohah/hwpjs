"""Independent ZIP/XML comparison for tabdef paragraph-one boundary insertion."""
import base64
import io
import json
import sys
import xml.etree.ElementTree as ET
import zipfile


def compare(before_bytes, after_bytes, position, text):
    if not isinstance(position, int) or position not in range(4):
        raise ValueError("Invalid oracle position")
    parser = lambda: ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
    with zipfile.ZipFile(io.BytesIO(before_bytes)) as before, zipfile.ZipFile(io.BytesIO(after_bytes)) as after:
        if before.namelist() != after.namelist() or after.testzip() is not None:
            raise ValueError("ZIP mismatch")
        for entry in before.infolist():
            expected = before.read(entry)
            actual = after.read(entry.filename)
            if entry.filename == "Contents/section0.xml":
                root = ET.fromstring(expected, parser=parser())
                hp = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
                paragraph = next(root.iter(hp + "p"))
                owner = next(paragraph.iter(hp + "t"))
                tabs = list(owner)
                if len(tabs) != 3 or any(tab.tag != hp + "tab" for tab in tabs) or owner.text or any(tab.tail for tab in tabs):
                    raise ValueError("Fixture topology drift")
                if position == 0:
                    owner.text = text
                else:
                    tabs[position - 1].tail = text
                if ET.tostring(root) != ET.tostring(ET.fromstring(actual, parser=parser())):
                    raise ValueError("XML or tab metadata changed")
            elif expected != actual:
                raise ValueError("Other payload changed")
            current = after.getinfo(entry.filename)
            for field in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                if getattr(entry, field) != getattr(current, field):
                    raise ValueError("ZIP metadata changed")
        if before.comment != after.comment:
            raise ValueError("Archive comment changed")


def self_test():
    def archive(xml, other=b"keep"):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as package:
            package.writestr("Contents/section0.xml", xml)
            package.writestr("other", other)
        return output.getvalue()
    prefix = "<s xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>"
    suffix = "</p:t></p:run></p:p></s>"
    body = "<p:tab width='1'/><p:tab width='2'/><p:tab width='3'/>"
    original = archive(prefix + body + suffix)
    valid = archive(prefix + "한😀" + body + suffix)
    compare(original, valid, 0, "한😀")
    for broken in [original, archive(prefix + "한😀" + body.replace("width='2'", "width='9'") + suffix), archive(prefix + "한😀" + body + suffix, b"changed"), archive(prefix + body + "한😀" + suffix)]:
        try:
            compare(original, broken, 0, "한😀")
        except ValueError:
            continue
        raise ValueError("Oracle accepted corruption")
    print("Tab oracle: valid edit and four corruptions verified")


if __name__ == "__main__" and "--self-test" in sys.argv:
    self_test()
elif __name__ == "__main__":
    request = json.load(sys.stdin)
    compare(base64.b64decode(request["before"]), base64.b64decode(request["after"]), request["position"], request["text"])
