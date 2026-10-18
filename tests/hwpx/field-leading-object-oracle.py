"""Adversarial checks for source-selected field/object prefix expectations."""
import io
from pathlib import Path
import runpy
import sys
import unittest
import zipfile

TOOLS = Path(__file__).resolve().parents[2] / "tools"
sys.path.insert(0, str(TOOLS))
compare = runpy.run_path(str(TOOLS / "hwpx-field-edit-oracle.py"))["compare"]


def archive(xml, other=b"keep"):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as target:
        target.writestr("Contents/section0.xml", xml)
        target.writestr("Contents/header.xml", other)
    return output.getvalue()


class LeadingFieldObject(unittest.TestCase):
    def test_each_supported_leading_object_preserves_payload_and_dirty(self):
        for kind in ("tbl", "pic", "container"):
            with self.subTest(kind=kind):
                xml = ("<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>"
                       "<p:fieldBegin id='7' type='CLICK_HERE' dirty='0'/>"
                       f"<p:p><p:run><p:{kind} id='8'/><p:t>A</p:t></p:run></p:p>"
                       "<p:fieldEnd beginIDRef='7'/></r>").encode()
                prefix = b"<p:t>X</p:t>"
                valid = xml.replace(b"dirty='0'", b"dirty='1'").replace(
                    f"<p:{kind}".encode(), prefix + f"<p:{kind}".encode())
                check = lambda after, other=b"keep": compare(archive(xml), archive(after, other), "X", "7", 1)
                check(valid)
                mutants = (
                    valid.replace(b"id='8'", b"id='9'"),
                    valid.replace(b"dirty='1'", b"dirty='0'"),
                    valid.replace(prefix, b"").replace(b">A<", b">XA<"),
                    valid.replace(b"beginIDRef='7'", b"beginIDRef='9'"),
                    valid.replace(b">X<", b">wrong<"),
                )
                for mutant in mutants:
                    with self.assertRaises(ValueError):
                        check(mutant)
                with self.assertRaises(ValueError):
                    check(valid, b"corrupted header")

    def test_object_before_field_does_not_authorize_outside_insertion(self):
        xml = ("<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>"
               "<p:p><p:run><p:tbl/><p:fieldBegin id='7' type='CLICK_HERE'/>"
               "<p:t>A</p:t><p:fieldEnd beginIDRef='7'/></p:run></p:p></r>").encode()
        saved = xml.replace(b"<p:tbl/>", b"<p:t>X</p:t><p:tbl/>")
        with self.assertRaisesRegex(ValueError, "outside selected field"):
            compare(archive(xml), archive(saved), "X", "7", 1)


if __name__ == "__main__":
    unittest.main()
