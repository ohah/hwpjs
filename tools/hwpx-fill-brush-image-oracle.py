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


OPF = "{http://www.idpf.org/2007/opf/}"
CORE = "{http://www.hancom.co.kr/hwpml/2011/core}"
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


def observe(root, source, items, by_id, names, counts):
    for parent in root.iter():
        for brush in parent:
            if brush.tag != CORE + "fillBrush":
                continue
            for variant in brush:
                if variant.tag != CORE + "imgBrush":
                    continue
                for leaf in variant:
                    if leaf.tag != CORE + "img":
                        continue
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
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-fill-brush-image-oracle.py [--self-test]")
    for index, counts in enumerate(collect()):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
