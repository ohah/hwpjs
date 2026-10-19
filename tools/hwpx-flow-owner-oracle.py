"""Independent header/footer owner split oracle; shared ZIP/XML boundaries."""
import base64
import importlib.util
import json
import pathlib
import sys
import xml.etree.ElementTree as E

from hwpx_numeric_package import expectation, require

spec = importlib.util.spec_from_file_location("structure_save_oracle", pathlib.Path(__file__).with_name("hwpx-structure-save-oracle.py"))
structure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(structure)


def verify(value):
    kind = value["kind"]
    require(kind in ("page", "column"), "Invalid expected flow kind")
    before = base64.b64decode(value["before"], validate=True)
    after = base64.b64decode(value["after"], validate=True)
    with expectation(before, after, "Contents/section0.xml") as (original, current):
        # Pinned headerfooter source: second paragraph owns nested page areas.
        source = list(original.iter(structure.P + "p"))
        require(len(source) == 4 and all(row.get("id") != "1" for row in source), "Wrong owner source fixture")
        require(any(node.tag == structure.P + "header" for node in source[1].iter()), "Missing source header")
        require(any(node.tag == structure.P + "footer" for node in source[1].iter()), "Missing source footer")
        generated = [row for row in current.iter(structure.P + "p") if row.get("id") == "1"]
        require(len(generated) == 1, "Wrong generated sibling identity")
        right = generated[0]
        require(right.get("pageBreak") == ("1" if kind == "page" else "0") and right.get("columnBreak") == ("1" if kind == "column" else "0"), "Wrong explicit flow flags")
        right.set("pageBreak", "0")
        right.set("columnBreak", "0")
        structure.compare_xml(E.tostring(original), E.tostring(current), 1, 1)


if __name__ == "__main__":
    verify(json.load(sys.stdin))
    print("verified")
