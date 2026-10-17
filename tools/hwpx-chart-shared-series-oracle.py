"""Independent shared-copy check; reuse the complete single-pair ZIP/OLE oracle."""
import base64
import copy
import io
import json
import runpy
import sys
import zipfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify(data):
    before, after = [zipfile.ZipFile(io.BytesIO(base64.b64decode(data[key], validate=True))) for key in ("before", "after")]
    require(before.namelist() == after.namelist() and len(set(before.namelist())) == len(before.namelist()), "Shared ZIP inventory mismatch")
    require(before.comment == after.comment, "Shared ZIP comment mismatch")
    require(before.testzip() is None and after.testzip() is None, "Shared ZIP CRC mismatch")
    fields = ("filename", "date_time", "compress_type", "flag_bits", "create_system", "create_version", "extract_version", "internal_attr", "external_attr", "extra", "comment")
    for old, new in zip(before.infolist(), after.infolist()):
        require(all(getattr(old, key) == getattr(new, key) for key in fields), "Shared ZIP entry metadata mismatch")
    pairs = data["pairs"]
    require(type(pairs) is list and len(pairs) > 0, "Missing shared pair inventory")
    require(all(type(pair) is dict and set(pair) == {"chart", "ole", "value_node"} for pair in pairs), "Invalid shared pair inventory")
    active = {pair[key] for pair in pairs for key in ("chart", "ole")}
    require(active <= set(before.namelist()), "Unknown shared part")

    def project(archive, selected):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as target:
            target.comment = archive.comment
            for info in archive.infolist():
                if info.filename not in active or info.filename in selected:
                    target.writestr(copy.copy(info), archive.read(info.filename))
        return base64.b64encode(output.getvalue()).decode("ascii")

    single_pair = runpy.run_path("tools/hwpx-chart-session-oracle.py")["verify"]
    for pair in pairs:
        selected = {pair["chart"], pair["ole"]}
        # No active copy is trusted or skipped: each occurs in at least one
        # complete pair check. All opaque parts remain in every projection.
        single_pair({**data, **pair, "kind": "direct_series", "before": project(before, selected), "after": project(after, selected)})


if __name__ == "__main__":
    verify(json.load(sys.stdin))
