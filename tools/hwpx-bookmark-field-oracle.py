"""Explicit BOOKMARK adapter; the generic field oracle stays strict."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import sys
import zipfile

spec = importlib.util.spec_from_file_location("field_oracle", Path(__file__).with_name("hwpx-field-edit-oracle.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
strict_fragments = base.fragments


def bookmark_fragments(tree):
    return strict_fragments(tree, ("BOOKMARK",))


def inventory(before):
    result = []
    with zipfile.ZipFile(io.BytesIO(before)) as source:
        for name in source.namelist():
            if not name.startswith("Contents/section") or not name.endswith(".xml"):
                continue
            tree = base.ET.fromstring(source.read(name))
            indices = {node: index for index, node in enumerate(tree.iter())}
            result.extend({"part": name, "beginId": begin.get("id"), "beginElement": indices[begin], "paragraph": paragraph}
                          for begin, paragraph, _ in bookmark_fragments(tree))
    return result


def verify(data):
    if not isinstance(data.get("beginId"), str) or not data["beginId"] or type(data.get("paragraph")) is not int or data["paragraph"] < 1:
        raise ValueError("Explicit BOOKMARK target required")
    base.fragments = bookmark_fragments
    try:
        base.compare(base64.b64decode(data["before"], validate=True), base64.b64decode(data["after"], validate=True), data["text"], data["beginId"], data["paragraph"])
    finally:
        base.fragments = strict_fragments


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    if payload.get("mode") == "inventory":
        print(json.dumps(inventory(base64.b64decode(payload["before"], validate=True))))
    elif payload.get("mode") == "prefix":
        verify(payload)
        print("Explicit BOOKMARK: full XML/ZIP and dirty owners verified")
    else:
        raise ValueError("Unknown BOOKMARK oracle mode")
