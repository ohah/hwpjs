"""Independent ZIP/XML oracle for explicit start-of-paragraph flow breaks."""
import importlib.util
import io
import json
import base64
import pathlib
import sys
import zipfile
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location("structure_save_oracle", pathlib.Path(__file__).with_name("hwpx-structure-save-oracle.py"))
structure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(structure)


def verify(value):
    kind = value["kind"]
    if kind not in ("page", "column"):
        raise ValueError("Invalid expected flow break kind")
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(value["before"], validate=True))) as before, zipfile.ZipFile(io.BytesIO(base64.b64decode(value["after"], validate=True))) as after:
        if before.namelist() != after.namelist() or before.comment != after.comment or after.testzip() is not None:
            raise ValueError("ZIP inventory, comment or integrity mismatch")
        for entry in before.infolist():
            original, current = before.read(entry.filename), after.read(entry.filename)
            if entry.filename == "Contents/section0.xml":
                root = structure.parse(current)
                paragraphs = list(root.iter(structure.P + "p"))
                right = paragraphs[1]
                if right.get("pageBreak") != ("1" if kind == "page" else "0") or right.get("columnBreak") != ("1" if kind == "column" else "0"):
                    raise ValueError("Wrong explicit flow flags")
                right.set("pageBreak", "0")
                right.set("columnBreak", "0")
                # Fixture-pinned first free ID is independent of product output.
                structure.compare_xml(original, ET.tostring(root), 0, 1)
            elif original != current:
                raise ValueError("Non-target ZIP entry changed: " + entry.filename)
            updated = after.getinfo(entry.filename)
            for field in ("compress_type", "date_time", "extra", "comment", "external_attr", "internal_attr", "create_system"):
                if getattr(entry, field) != getattr(updated, field):
                    raise ValueError("ZIP metadata changed: " + entry.filename + "/" + field)


if __name__ == "__main__":
    verify(json.load(sys.stdin))
    print("verified")
