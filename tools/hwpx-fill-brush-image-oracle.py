#!/usr/bin/env python3
"""Independent OPF-ID census for raw HWPX fillBrush image leaves."""

from collections import Counter
import io
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
import zlib


OPF = "{http://www.idpf.org/2007/opf/}"
CORE = "{http://www.hancom.co.kr/hwpml/2011/core}"
PARAGRAPH = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
ROOTS = (Path("legacy/rust/crates/hwp-core/tests/fixtures"), Path("reference/rhwp/samples"))
MASTER = re.compile(r"Contents/masterpage[0-9]+\.xml\Z")
SECTION = re.compile(r"Contents/section[0-9]+\.xml\Z")


def selected_items(archive):
    root = ET.fromstring(archive.read("Contents/content.hpf"))
    manifest_node = root.find(OPF + "manifest")
    spine_node = root.find(OPF + "spine")
    if manifest_node is None or spine_node is None:
        raise ValueError("missing OPF manifest or spine")
    items = list(manifest_node.findall(OPF + "item"))
    by_id = {item.get("id"): (index, item) for index, item in enumerate(items)}
    if len(by_id) != len(items) or None in by_id:
        raise ValueError("duplicate or absent OPF item ID")
    parts = []
    for ref in spine_node.findall(OPF + "itemref"):
        pair = by_id.get(ref.get("idref"))
        if pair is None:
            raise ValueError("missing spine target")
        index, item = pair
        href = item.get("href", "")
        if href == "Contents/header.xml" or SECTION.fullmatch(href):
            parts.append(("document", index, href))
    for index, item in enumerate(items):
        href = item.get("href", "")
        if MASTER.fullmatch(href):
            parts.append(("master", index, href))
    return items, by_id, parts


def image_leaves(root):
    for parent in root.iter():
        for brush in parent:
            if brush.tag != CORE + "fillBrush":
                continue
            for variant in brush:
                if variant.tag != CORE + "imgBrush":
                    continue
                for leaf in variant:
                    if leaf.tag == CORE + "img":
                        yield parent, leaf


def picture_leaves(root):
    for picture in root.iter(PARAGRAPH + "pic"):
        for leaf in picture:
            if leaf.tag == CORE + "img":
                yield leaf


def picture_archive(archive):
    counts = Counter()
    _, by_id, parts = selected_items(archive)
    for source, _, href in parts:
        if source == "document" and href == "Contents/header.xml":
            continue
        for leaf in picture_leaves(ET.fromstring(archive.read(href))):
            raw = leaf.get("binaryItemIDRef")
            if raw is None:
                state, index = "absent", None
            elif raw == "":
                state, index = "empty", None
            elif raw not in by_id:
                state, index = "missing", None
            else:
                index, item = by_id[raw]
                state = "external" if item.get("isEmbeded") == "0" else "embedded"
            counts[source + "_" + state] += 1
            counts[source + "_sites"] += 1
            if index is not None:
                counts[source + "_target_index_sum"] += index
    return counts


def collect_pictures():
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            counts["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    if encrypted(archive):
                        counts["encrypted"] += 1
                        continue
                    document = picture_archive(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                counts["unreadable"] += 1
            else:
                counts.update(document)
    return shards


def observe(root, source, items, by_id, names, counts):
    for parent, leaf in image_leaves(root):
        raw = leaf.get("binaryItemIDRef")
        if raw is None:
            state, index = "absent", None
        elif raw == "":
            state, index = "empty", None
        elif raw not in by_id:
            state, index = "missing", None
        else:
            index, item = by_id[raw]
            if item.get("isEmbeded") == "0":
                state = "external"
            elif item.get("href") in names:
                state = "embedded"
            else:
                raise ValueError("missing embedded target")
        counts[source + "_" + state] += 1
        counts["sites"] += 1
        if index is not None:
            counts[source + "_target_index_sum"] += index
        counts[source + "_parent_" + parent.tag.rsplit("}", 1)[-1]] += 1


def byte_format(data):
    if data.startswith(bytes.fromhex("89504e470d0a1a0a")):
        return "png"
    if data.startswith(bytes.fromhex("ffd8")):
        return "jpeg"
    if data.startswith(b"BM"):
        return "bmp"
    if data.startswith(b"GIF"):
        return "gif"
    return "unknown"


def matching_media(kind, media):
    return media in {"png": ("image/png",), "jpeg": ("image/jpeg", "image/jpg"), "bmp": ("image/bmp",), "gif": ("image/gif",)}.get(kind, ())


def png_defects(data):
    if byte_format(data) != "png":
        raise ValueError("not PNG")
    at = 8
    bad = 0
    while True:
        if at + 12 > len(data):
            return bad, True
        length = int.from_bytes(data[at:at + 4], "big")
        end = at + 8 + length
        if end + 4 > len(data):
            return bad, True
        bad += int.from_bytes(data[end:end + 4], "big") != zlib.crc32(data[at + 4:end])
        name = data[at + 4:at + 8]
        at = end + 4
        if name == b"IEND":
            return bad, at != len(data)


def payload_archive(archive):
    counts = Counter()
    _, by_id, parts = selected_items(archive)
    seen = set()
    for source, _, href in parts:
        for _, leaf in image_leaves(ET.fromstring(archive.read(href))):
            counts[source + "_sites"] += 1
            pair = by_id.get(leaf.get("binaryItemIDRef"))
            if pair is None or pair[1].get("isEmbeded") == "0":
                counts[source + "_non_embedded"] += 1
                continue
            index, item = pair
            if (source, index) in seen:
                continue
            seen.add((source, index))
            data = archive.read(item.get("href"))
            kind = byte_format(data)
            counts[source + "_targets"] += 1
            counts[source + "_" + kind] += 1
            counts[source + "_media_mismatch"] += not matching_media(kind, item.get("media-type"))
            counts[source + "_encoded_bytes"] += len(data)
            if kind == "png":
                bad, malformed = png_defects(data)
                counts[source + "_invalid_png_targets"] += bad != 0 or malformed
                counts[source + "_bad_png_crc_chunks"] += bad
                counts[source + "_malformed_png_targets"] += malformed
    return counts


def collect_payloads():
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            counts["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    if encrypted(archive):
                        counts["encrypted"] += 1
                        continue
                    document = payload_archive(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                counts["unreadable"] += 1
            else:
                counts.update(document)
    return shards


def inspect_archive(archive):
    counts = Counter()
    items, by_id, parts = selected_items(archive)
    names = set(archive.namelist())
    for source, _, href in parts:
        counts[source + "_parts"] += 1
        observe(ET.fromstring(archive.read(href)), source, items, by_id, names, counts)
    return counts


def encrypted(archive):
    if "META-INF/manifest.xml" not in archive.namelist():
        return False
    root = ET.fromstring(archive.read("META-INF/manifest.xml"))
    return any(item.tag.rsplit("}", 1)[-1] == "encryption-data" for item in root.iter())


def collect():
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            counts["files"] += 1
            try:
                with zipfile.ZipFile(path) as archive:
                    if encrypted(archive):
                        counts["encrypted"] += 1
                        continue
                    document = inspect_archive(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                counts["unreadable"] += 1
            else:
                counts.update(document)
    return shards


def self_test():
    pictured = ET.fromstring("<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'><p:pic><c:img binaryItemIDRef='img&#49;'/><x:img/><p:container><c:img/></p:container></p:pic><x:pic><c:img/></x:pic></s:sec>")
    assert [leaf.get("binaryItemIDRef") for leaf in picture_leaves(pictured)] == ["img1"]
    picture_opf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" + "".join(
        f"<o:item id='{name}' href='{href}' media-type='application/xml'{extra}/>"
        for name, href, extra in (
            ("h", "Contents/header.xml", ""),
            ("s", "Contents/section0.xml", ""),
            ("m", "Contents/masterpage0.xml", ""),
            ("img1", "BinData/image.png", ""),
            ("ext", "https://example.invalid/img.png", " isEmbeded='0'"),
        )
    ) + "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>"
    picture_section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>" + "".join(
        "<p:pic><c:img" + attribute + "/></p:pic>"
        for attribute in (" binaryItemIDRef='img&#49;'", " binaryItemIDRef='ext'", " binaryItemIDRef='missing'", " binaryItemIDRef=''", "")
    ) + "</s:sec>"
    picture_master = "<masterPage xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:pic><c:img binaryItemIDRef='img1'/></p:pic></masterPage>"
    pictured_archive = io.BytesIO()
    with zipfile.ZipFile(pictured_archive, "w") as archive:
        archive.writestr("Contents/content.hpf", picture_opf)
        archive.writestr("Contents/header.xml", "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>")
        archive.writestr("Contents/section0.xml", picture_section)
        archive.writestr("Contents/masterpage0.xml", picture_master)
        archive.writestr("BinData/image.png", b"image")
    with zipfile.ZipFile(pictured_archive) as archive:
        picture_counts = picture_archive(archive)
    assert [picture_counts["document_" + state] for state in ("embedded", "external", "missing", "empty", "absent")] == [1] * 5
    assert picture_counts["master_embedded"] == 1 and picture_counts["document_sites"] == 5
    assert byte_format(bytes.fromhex("89504e470d0a1a0a")) == "png"
    assert byte_format(bytes.fromhex("ffd8")) == "jpeg"
    assert not matching_media("png", "image/jpg")
    valid_png = bytes.fromhex("89504e470d0a1a0a") + b"\0\0\0\0IEND" + zlib.crc32(b"IEND").to_bytes(4, "big")
    assert png_defects(valid_png) == (0, False)
    assert png_defects(valid_png[:-1] + bytes([valid_png[-1] ^ 1])) == (1, False)
    assert png_defects(valid_png[:-3]) == (0, True)
    opf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" + "".join(
        f"<o:item id='{name}' href='{href}' media-type='application/xml'{extra}/>"
        for name, href, extra in (
            ("h", "Contents/header.xml", ""),
            ("m", "Contents/masterpage0.xml", ""),
            ("img1", "BinData/image.png", ""),
            ("ext", "https://example.invalid/img.png", " isEmbeded='0'"),
        )
    ) + "</o:manifest><o:spine><o:itemref idref='h'/></o:spine></o:package>"
    header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'><x:fillBrush/>" + "".join(
        "<c:fillBrush><c:imgBrush><c:img" + attribute + "/></c:imgBrush></c:fillBrush>"
        for attribute in (" binaryItemIDRef='img&#49;'", " binaryItemIDRef='ext'", " binaryItemIDRef='BinData/image.png'", " binaryItemIDRef=''", "")
    ) + "</h:head>"
    master = "<masterPage xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><c:fillBrush><c:imgBrush><c:img binaryItemIDRef='missing'/></c:imgBrush></c:fillBrush></masterPage>"
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.writestr("Contents/content.hpf", opf)
        archive.writestr("Contents/header.xml", header)
        archive.writestr("Contents/masterpage0.xml", master)
        archive.writestr("BinData/image.png", b"data")
    with zipfile.ZipFile(archive_bytes) as archive:
        counts = inspect_archive(archive)
    assert [counts["document_" + state] for state in ("embedded", "external", "missing", "empty", "absent")] == [1] * 5
    assert counts["master_missing"] == 1 and counts["sites"] == 6
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.writestr("Contents/content.hpf", opf)
        archive.writestr("Contents/header.xml", header)
        archive.writestr("Contents/masterpage0.xml", "<broken")
        archive.writestr("BinData/image.png", b"data")
    with zipfile.ZipFile(archive_bytes) as archive:
        try:
            inspect_archive(archive)
        except ET.ParseError:
            pass
        else:
            raise AssertionError("partial malformed archive accepted")


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("fill brush image oracle self-test passed")
        return
    if sys.argv[1:] == ["--payloads"]:
        for index, counts in enumerate(collect_payloads()):
            print(index, dict(sorted(counts.items())))
        return
    if sys.argv[1:] == ["--pictures"]:
        for index, counts in enumerate(collect_pictures()):
            print(index, dict(sorted(counts.items())))
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-fill-brush-image-oracle.py [--self-test|--payloads|--pictures]")
    for index, counts in enumerate(collect()):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
