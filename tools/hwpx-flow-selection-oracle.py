"""Plain styled selection split: shared package envelope and scalar signatures."""
import base64
import importlib.util
import json
import pathlib
import sys
import xml.etree.ElementTree as E

from hwpx_numeric_package import expectation, require

spec = importlib.util.spec_from_file_location("character_style_oracle", pathlib.Path(__file__).with_name("hwpx-character-format-oracle.py"))
style = importlib.util.module_from_spec(spec)
spec.loader.exec_module(style)
P = style.P


def verify(value):
    kind, start, end = value["kind"], value["startUnit"], value["endUnit"]
    require(kind in ("page", "column"), "Invalid flow kind")
    before = base64.b64decode(value["before"], validate=True)
    after = base64.b64decode(value["after"], validate=True)
    with expectation(before, after, "Contents/section0.xml") as (old, new):
        source, saved = list(old), list(new)
        require(len(source) == 7 and len(saved) == 8 and all(row.tag == P + "p" for row in source + saved), "Wrong fixture paragraph topology")
        original, left, right = source[1], saved[1], saved[2]
        expected, length = style.signature(original)
        require("".join(row[2] for row in expected) == "기울임진하게", "Wrong source text")
        boundaries = {0, length} | {row[0] for row in expected} | {row[1] for row in expected}
        require(type(start) is int and type(end) is int and 0 <= start <= end <= length and start in boundaries and end in boundaries, "Invalid selection")
        left_rows, left_length = style.signature(left)
        right_rows, right_length = style.signature(right)
        require(left_rows == [row for row in expected if row[1] <= start] and left_length == start, "Left styled text")
        require(right_rows == [(lo - end, hi - end, char, font, attrs, text_attrs) for lo, hi, char, font, attrs, text_attrs in expected if lo >= end] and right_length == length - end, "Right styled text")
        require(left.attrib == original.attrib, "Left attributes")
        attrs = dict(original.attrib, id="1", pageBreak="1" if kind == "page" else "0", columnBreak="1" if kind == "column" else "0")
        require(all(row.get("id") != "1" for row in source) and right.attrib == attrs, "Right identity or flow attributes")
        for paragraph in (left, right):
            require(not paragraph.text and all(run.tag == P + "run" and not run.text and not run.tail and all(child.tag == P + "t" and len(child) == 0 and not child.tail for child in run) for run in paragraph), "Unexpected split child or retained line geometry")
        # Remove only the selected paragraphs; every other XML node remains exact.
        require((left.tail or "") == "" and right.tail == original.tail, "Paragraph tails")
        old.remove(original)
        new.remove(left)
        new.remove(right)
        require(E.tostring(old) == E.tostring(new), "Non-target XML changed")


if __name__ == "__main__":
    verify(json.load(sys.stdin))
    print("verified")
