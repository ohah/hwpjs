"""Positive and exact-failure controls for the shared numeric oracle envelope."""
import copy
import io
import json
from pathlib import Path
import runpy
import sys
import warnings
import zipfile

checks = runpy.run_path(str(Path(__file__).with_name("hwpx_numeric_package.py")))
require = checks["require"]
PART = "Contents/section0.xml"
XML = b"<root><!--keep--><?test keep?><value>12</value></root>"


def archive(mutation=None):
    output = io.BytesIO()
    names = [PART, "Contents/header.xml"]
    if mutation == "order": names.reverse()
    if mutation == "missing": names.pop()
    if mutation == "duplicate": names.append(PART)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(output, "w") as target:
            target.comment = b"changed" if mutation == "comment" else b"original"
            for name in names:
                entry = zipfile.ZipInfo(name, (2020, 1, 2, 3, 4, 6))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                entry.internal_attr = 0
                entry.create_system = 3
                payload = XML if name == PART else b"<header/>"
                if name == "Contents/header.xml":
                    if mutation == "payload": payload += b"changed"
                    elif mutation == "compress_type": entry.compress_type = zipfile.ZIP_STORED
                    elif mutation == "date_time": entry.date_time = (2021, 1, 2, 3, 4, 6)
                    elif mutation == "extra": entry.extra = b"\x01\x00\x00\x00"
                    elif mutation == "entry_comment": entry.comment = b"changed"
                    elif mutation == "external_attr": entry.external_attr ^= 1 << 16
                    elif mutation == "internal_attr": entry.internal_attr = 1
                    elif mutation == "create_system": entry.create_system = 0
                target.writestr(copy.copy(entry), payload)
    raw = output.getvalue()
    if mutation == "crc":
        damaged = bytearray(raw)
        index = damaged.index(b"PK\x01\x02") + 16
        damaged[index] ^= 1
        raw = bytes(damaged)
    return raw


def rejected(callback, expected):
    try:
        callback()
    except ValueError as error:
        require(str(error) == expected, "Unexpected package rejection: " + str(error))
        return
    raise ValueError("Package oracle accepted mutation: " + expected)


def compare(before, after):
    with checks["expectation"](before, after, PART) as (expected, actual):
        require(expected is not actual, "Shared mutable XML root")
        require(len(expected) == 3 and len(actual) == 3, "Lost XML comment or processing instruction")
        expected[-1].text = "changed"
        require(actual[-1].text == "12", "Aliased XML child")


def verify():
    require(len(sys.argv) == 1, "Unexpected numeric package self-test argument")
    before = archive()
    compare(before, archive())
    metadata = ("compress_type", "date_time", "extra", "entry_comment", "external_attr", "internal_attr", "create_system")
    for mutation in metadata:
        rejected(lambda: compare(before, archive(mutation)), "ZIP metadata")
    for mutation in ("order", "missing", "duplicate", "comment"):
        rejected(lambda: compare(before, archive(mutation)), "ZIP inventory")
    rejected(lambda: compare(before, archive("payload")), "Non-target payload")
    rejected(lambda: compare(before, archive("crc")), "ZIP integrity")
    for raw in (b"<!DOCTYPE root><root/>", b"<!ENTITY bad 'value'><root/>"):
        rejected(lambda: checks["parse"](raw), "Unsupported declaration")
    return {"envelopeMutants": 13, "xmlDeclarationMutants": 2, "xmlTreesIndependent": True}


if __name__ == "__main__":
    print(json.dumps(verify()))
