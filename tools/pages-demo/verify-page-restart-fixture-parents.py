"""Own blank-to-example byte ancestry; no SDK, ABI, or user insertion operation."""
import hashlib
import importlib.util
import json
import struct
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("own_cfb", ROOT / "tools/hwp5-cell-width-oracle.py")
cfb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfb)


def require(value, reason):
    if not value:
        raise ValueError(reason)


def record(tag, level, payload):
    return struct.pack("<I", tag | level << 10 | len(payload) << 20) + payload


def verify_h5(parent, fixture):
    a, b = cfb.Cfb(parent), cfb.Cfb(fixture)
    require(set(a.streams) == {"FileHeader", "DocInfo", "BodyText/Section0"}, "normal blank inventory")
    require(set(b.streams) == set(a.streams) | {"BodyText/Section1", "Opaque"}, "proof fixture inventory")
    require(a.streams["FileHeader"] == b.streams["FileHeader"], "normal blank FileHeader exact")
    require(cfb.u32(a.streams["FileHeader"], 36) & 1 == 0, "uncompressed own factory")
    info = bytearray(a.streams["DocInfo"])
    sites = [row for row in cfb.records(info) if row[0] == 16]
    require(len(sites) == 1 and cfb.u16(info, sites[0][3]) == 1, "normal blank section count")
    struct.pack_into("<H", info, sites[0][3], 2)
    require(bytes(info) == b.streams["DocInfo"], "DocInfo only section count 1 to 2")
    header = bytearray(22)
    struct.pack_into("<II", header, 0, 12, 1 << 21)
    struct.pack_into("<H", header, 12, 1)
    text = bytearray(24)
    struct.pack_into("<HHHH", text, 0, 0xC55E, 0xD83D, 0xDE00, 21)
    text[8:12] = b"onwn"
    struct.pack_into("<HH", text, 20, 21, 13)
    extra = record(66, 0, header) + record(67, 1, text) + record(68, 1, bytes(8))
    extra += record(71, 1, b"onwn" + struct.pack("<IH", 0, 7))
    wanted = a.streams["BodyText/Section0"] + extra
    require(b.streams["BodyText/Section0"] == b.streams["BodyText/Section1"] == wanted, "two exact proof sections from normal blank")
    require(b.streams["Opaque"] == bytes.fromhex("00ff007f"), "proof sentinel exact")
    return {"normalBlankHeaderExact": True, "sectionCount": [1, 2], "restartNumber": 7, "sections": 2, "proofSentinelHex": "00ff007f", "parentContainerWholePreservationClaim": False}


def verify_hx(parent, fixture, recipe):
    with ZipFile(BytesIO(parent)) as a, ZipFile(BytesIO(fixture)) as b:
        require(a.namelist() == b.namelist() and len(set(a.namelist())) == len(a.namelist()), "ZIP inventory exact")
        selected = "Contents/section0.xml"
        for name in a.namelist():
            left, right = a.read(name), b.read(name)
            if name == selected:
                marker = recipe["insertBefore"].encode()
                require(left.count(marker) == 1 and left.endswith(marker), "normal blank closing section")
                wanted = left[:-len(marker)] + recipe["paragraph"].encode() + marker
                require(right == wanted, "one exact controlled PAGE paragraph only")
            else:
                require(left == right, "unrelated ZIP entry exact " + name)
        return {"selectedPart": selected, "normalBlankOtherEntriesExact": True, "insertedParagraphs": 1, "restartNumber": 7}


def main():
    directory = ROOT / "tools/pages-demo"
    policy = json.loads((directory / "public-gallery-fixtures-135.json").read_bytes())
    provenance = json.loads((directory / "page-restart-fixture-provenance.json").read_bytes())
    recipe = json.loads((directory / "page-restart-fixture-recipe.json").read_bytes())
    result = {}
    for item in provenance["inputs"]:
        row = next(row for row in policy["files"] if row["id"] == item["parentId"])
        parent = (ROOT / "apps/docs/docs/public/editor" / row["path"]).read_bytes()
        fixture = (directory / "fixtures" / item["id"]).read_bytes()
        digest = lambda value: hashlib.sha256(value).hexdigest()
        require(len(parent) == row["bytes"] == item["parentBytes"] and digest(parent) == row["sha256"] == item["parentSHA256"], "existing approved policy parent bytes exact")
        require(len(fixture) == item["fixtureBytes"] and digest(fixture) == item["fixtureSHA256"], "exact approved GUI original")
        result[item["id"]] = verify_h5(parent, fixture) if item["id"].endswith(".hwp") else verify_hx(parent, fixture, recipe["HWPX"])
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
