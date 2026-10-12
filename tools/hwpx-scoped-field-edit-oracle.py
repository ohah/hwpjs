"""Explicit closed-target oracle; strict whole XML/ZIP comparison is reused unchanged."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import sys
import zipfile

spec = importlib.util.spec_from_file_location("strict_field_oracle", Path(__file__).with_name("hwpx-field-edit-oracle.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
strict_fragments = base.fragments


def compare(before, after, text, begin_id, paragraph):
    if not isinstance(begin_id, str) or not begin_id or type(paragraph) is not int or paragraph < 1:
        raise ValueError("Explicit target required")

    def selected_fragments(tree):
        elements = list(tree.iter())
        positions = {element: index for index, element in enumerate(elements)}
        parents = {child: parent for parent in elements for child in parent}
        begins = [element for element in elements if element.tag == base.P + "fieldBegin"]
        ids = [element.get("id") for element in begins]
        if None in ids or len(set(ids)) != len(ids):
            raise ValueError("Duplicate or missing begin ID")
        by_id = {element.get("id"): element for element in begins}
        for end in (element for element in elements if element.tag == base.P + "fieldEnd"):
            begin = by_id.get(end.get("beginIDRef"))
            if begin is None or positions[begin] >= positions[end]:
                raise ValueError("Unresolved or forward field end")
            if begin.get("fieldid") is not None and end.get("fieldid") is not None and begin.get("fieldid") != end.get("fieldid"):
                raise ValueError("Field instance ID mismatch")
        targets = [element for element in begins if element.get("id") == begin_id]
        ends = [element for element in elements if element.tag == base.P + "fieldEnd" and element.get("beginIDRef") == begin_id]
        if len(targets) != 1 or len(ends) != 1 or positions[ends[0]] <= positions[targets[0]]:
            raise ValueError("Target field must have one forward end")
        target = targets[0]
        content_start = max(positions[element] for element in target.iter()) + 1
        content_end = positions[ends[0]]
        for begin in begins:
            matches = [element for element in elements if element.tag == base.P + "fieldEnd" and element.get("beginIDRef") == begin.get("id")]
            if len(matches) > 1:
                raise ValueError("Duplicate field end")
            if matches:
                continue
            owner = parents.get(begin)
            while owner is not None and owner.tag != base.P + "subList":
                owner = parents.get(owner)
            if owner is None:
                raise ValueError("Unresolved root field")
            start, end = positions[begin], max(positions[element] for element in owner.iter()) + 1
            if start <= content_start < end or content_start < start < content_end:
                raise ValueError("Target overlaps unresolved field scope")

        class TargetView:
            def iter(self, tag=None):
                return (element for element in tree.iter(tag) if element.tag != base.P + "fieldBegin" or element is target)

        return strict_fragments(TargetView())

    base.fragments = selected_fragments
    try:
        base.compare(before, after, text, begin_id, paragraph)
    finally:
        base.fragments = strict_fragments


def self_test():
    def archive(xml):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as target:
            target.writestr("Contents/section0.xml", xml)
            target.writestr("Contents/header.xml", b"opaque")
        return output.getvalue()
    xml = b"<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p><p:run><p:fieldBegin id='8' type='CLICK_HERE' name='orphan'/><p:t>keep</p:t></p:run></p:p></p:subList><p:subList><p:p><p:run><p:fieldBegin id='3' type='CLICK_HERE' dirty='0'/><p:t>safe</p:t><p:fieldEnd beginIDRef='3'/></p:run></p:p></p:subList></r>"
    saved = xml.replace(b"dirty='0'", b"dirty='1'").replace(b">safe<", b">Xsafe<")
    compare(archive(xml), archive(saved), "X", "3", 2)
    try:
        base.compare(archive(xml), archive(saved), "X", "3", 2)
    except ValueError as error:
        if str(error) != "Ambiguous field end":
            raise
    else:
        raise ValueError("Strict oracle unexpectedly accepted orphan")
    negatives = [
        (xml, saved.replace(b"name='orphan'", b"name='changed'")),
        (xml, saved.replace(b">keep<", b">changed<")),
        (xml, saved.replace(b">Xsafe<", b">wrong<")),
        (xml.replace(b"<p:fieldEnd beginIDRef='3'/>", b""), saved),
        (xml.replace(b"<p:fieldEnd beginIDRef='3'/>", b"<p:fieldEnd beginIDRef='3'/><p:fieldEnd beginIDRef='3'/>"), saved),
        (xml, saved.replace(b">keep</p:t>", b">keep</p:t><p:fieldEnd beginIDRef='8'/>")),
    ]
    overlap = xml.replace(b"</p:subList><p:subList>", b"", 1)
    overlap_saved = overlap.replace(b"dirty='0'", b"dirty='1'").replace(b">safe<", b">Xsafe<")
    root = xml.replace(b"<p:subList>", b"", 1).replace(b"</p:subList>", b"", 1)
    root_saved = root.replace(b"dirty='0'", b"dirty='1'").replace(b">safe<", b">Xsafe<")
    negatives.extend([(overlap, overlap_saved), (root, root_saved)])
    for before, after in negatives:
        try:
            compare(archive(before), archive(after), "X", "3", 2)
        except ValueError:
            continue
        raise ValueError("Scoped oracle accepted corruption")
    print("Scoped field oracle: closed target, unchanged orphan, strict refusal and eight corruptions verified")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        payload = json.load(sys.stdin)
        compare(base64.b64decode(payload["before"], validate=True), base64.b64decode(payload["after"], validate=True), payload["text"], payload["beginId"], payload["paragraph"])
        print("Scoped field edit: complete XML and ZIP with unchanged non-target orphan verified")
