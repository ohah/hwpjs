#!/usr/bin/env python3
"""Independent ZIP/OPF OLE candidate, envelope and byte census (not CFB validation)."""

from collections import Counter
import io
import os
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile


ROOTS = (Path("legacy/rust/crates/hwp-core/tests/fixtures"), Path("reference/rhwp/samples"))
OPF = "{http://www.idpf.org/2007/opf/}"
CFB_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")


def root_metadata(raw):
    if not raw.startswith(CFB_MAGIC) or len(raw) < 512:
        return None
    shift = struct.unpack_from("<H", raw, 30)[0]
    sid = struct.unpack_from("<I", raw, 48)[0]
    if shift not in (9, 12):
        return None
    offset = (sid + 1) * (1 << shift)
    entry = raw[offset:offset + 128]
    if len(entry) < 128:
        return None
    name_len = struct.unpack_from("<H", entry, 64)[0]
    name = entry[:name_len - 2].decode("utf-16le", "replace") if 2 <= name_len <= 64 else "<bad length>"
    return name, entry[66], struct.unpack_from("<Q", entry, 100)[0]


def fat_tail_nonfree(raw):
    """Check only unused FAT slots beyond the actual file sector count."""
    if not raw.startswith(CFB_MAGIC) or len(raw) < 512:
        return None
    shift = struct.unpack_from("<H", raw, 30)[0]
    if shift not in (9, 12):
        return None
    sector_size = 1 << shift
    fat_count = struct.unpack_from("<I", raw, 44)[0]
    if fat_count > 109 or len(raw) % sector_size:
        return None
    sector_count = len(raw) // sector_size - 1
    for index in range(fat_count):
        sid = struct.unpack_from("<I", raw, 76 + 4 * index)[0]
        part = raw[(sid + 1) * sector_size:(sid + 2) * sector_size]
        if len(part) != sector_size:
            return None
        for slot in range(sector_size // 4):
            if index * (sector_size // 4) + slot >= sector_count and struct.unpack_from("<I", part, 4 * slot)[0] != 0xFFFFFFFF:
                return True
    return False


def inspect(archive):
    counts = Counter()
    root = ET.fromstring(archive.read("Contents/content.hpf"))
    manifest = root.find(OPF + "manifest")
    if manifest is None or root.find(OPF + "spine") is None:
        raise ValueError("missing OPF manifest or spine")
    names = set(archive.namelist())
    for item in manifest.findall(OPF + "item"):
        href = item.get("href", "")
        media = item.get("media-type", "").split(";", 1)[0].strip(" \t").lower()
        if media != "application/ole" and not href.lower().endswith(".ole"):
            continue
        counts["candidates"] += 1
        external = item.get("isEmbeded") == "0"
        counts["external"] += external
        # An external URI is not fetched. Only an exact, safe BinData ZIP name
        # may be independently inspected as an observed packaged copy.
        if external and (not href.lower().startswith("bindata/") or
                         len(href) <= 8 or href.startswith("/") or
                         any(part in ("", "..") for part in href.split("/")) or "\\" in href):
            counts["missing"] += 1
            continue
        if href not in names:
            counts["missing"] += 1
            continue
        if archive.getinfo(href).file_size > 64 * 1024 * 1024:
            counts["oversize"] += 1
            continue
        data = archive.read(href)
        counts["copies"] += 1
        counts["external_copies"] += external
        counts["encoded_bytes"] += len(data)
        if data.startswith(CFB_MAGIC):
            counts["raw"] += 1
            inner = data
        elif data[4:12] == CFB_MAGIC:
            counts["prefixed"] += 1
            inner = data[4:]
            if struct.unpack_from("<I", data)[0] != len(data) - 4:
                counts["bad_prefix"] += 1
        else:
            counts["unknown"] += 1
            continue
        metadata = root_metadata(inner)
        if metadata is None:
            counts["unreadable_root"] += 1
        elif metadata != ("Root Entry", 5, 0):
            counts["invalid_root"] += 1
            if external:
                counts["invalid_root_external"] += 1
        tail = fat_tail_nonfree(inner)
        if tail is True:
            counts["fat_tail_nonfree"] += 1
        elif tail is None:
            counts["fat_tail_unreadable"] += 1
    return counts


def encrypted(archive):
    if "META-INF/manifest.xml" not in archive.namelist():
        return False
    root = ET.fromstring(archive.read("META-INF/manifest.xml"))
    return any(node.tag.rsplit("}", 1)[-1] == "encryption-data" for node in root.iter())


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
                    observed = inspect(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                counts["unreadable"] += 1
            else:
                counts["accepted"] += 1
                counts.update(observed)
    return shards


def self_test():
    root = bytearray(1024)
    root[:8] = CFB_MAGIC
    struct.pack_into("<H", root, 30, 9)
    struct.pack_into("<I", root, 48, 0)
    root_name = "Root Entry".encode("utf-16le") + b"\x00\x00"
    root[512:512 + len(root_name)] = root_name
    struct.pack_into("<H", root, 512 + 64, len(root_name))
    root[512 + 66] = 5
    assert root_metadata(root) == ("Root Entry", 5, 0)
    struct.pack_into("<Q", root, 512 + 100, 17)
    assert root_metadata(root) == ("Root Entry", 5, 17)
    struct.pack_into("<I", root, 44, 1)
    struct.pack_into("<I", root, 76, 0)
    root[512:1024] = b"\xff" * 512
    assert fat_tail_nonfree(root) is False
    struct.pack_into("<I", root, 512 + 4, 0)
    assert fat_tail_nonfree(root) is True
    xml = ("<p:package xmlns:p='http://www.idpf.org/2007/opf/'><p:manifest>"
           "<p:item href='BinData/external.ole' media-type='application/ole' isEmbeded='0'/>"
           "<p:item href='BinData/raw.OLE' media-type='application/octet-stream'/>"
           "<p:item href='https://example.invalid/x.ole' media-type='application/ole' isEmbeded='0'/>"
           "<p:item href='BinData/missing.ole' media-type='application/ole' isEmbeded='0'/>"
           "<p:item href='../escape.ole' media-type='application/ole' isEmbeded='0'/>"
           "</p:manifest><p:spine/></p:package>")
    encoded = io.BytesIO()
    with zipfile.ZipFile(encoded, "w") as archive:
        archive.writestr("Contents/content.hpf", xml)
        archive.writestr("BinData/external.ole", struct.pack("<I", 8) + CFB_MAGIC)
        archive.writestr("BinData/raw.OLE", CFB_MAGIC)
    with zipfile.ZipFile(io.BytesIO(encoded.getvalue())) as archive:
        observed = inspect(archive)
        assert observed == Counter(candidates=5, external=4, copies=2,
                                           external_copies=1, missing=3,
                                           encoded_bytes=20, prefixed=1, raw=1,
                                           unreadable_root=2, fat_tail_unreadable=2), observed
    encoded = io.BytesIO()
    with zipfile.ZipFile(encoded, "w") as archive:
        archive.writestr("Contents/content.hpf", xml)
        archive.writestr("BinData/external.ole", struct.pack("<I", 9) + CFB_MAGIC)
        archive.writestr("BinData/raw.OLE", b"not OLE")
    with zipfile.ZipFile(io.BytesIO(encoded.getvalue())) as archive:
        observed = inspect(archive)
        assert observed["bad_prefix"] == 1 and observed["unknown"] == 1


def root_probe():
    """Read only the CFB directory's first 128-byte entry, independently."""
    for root in ROOTS:
        for path in root.rglob("*.hwpx"):
            try:
                with zipfile.ZipFile(path) as archive:
                    if encrypted(archive):
                        continue
                    content = ET.fromstring(archive.read("Contents/content.hpf"))
                    manifest = content.find(OPF + "manifest")
                    if manifest is None:
                        continue
                    for item in manifest.findall(OPF + "item"):
                        href = item.get("href", "")
                        if ((item.get("media-type", "").split(";", 1)[0].strip(" \t").lower() != "application/ole" and
                             not href.lower().endswith(".ole")) or href not in archive.namelist()):
                            continue
                        data = archive.read(href)
                        raw = data[4:] if data[4:12] == CFB_MAGIC else data
                        if not raw.startswith(CFB_MAGIC) or len(raw) < 512:
                            continue
                        metadata = root_metadata(raw)
                        if metadata is None:
                            print(path, href, "unreadable root entry")
                            continue
                        name, kind, created = metadata
                        if name != "Root Entry" or kind != 5 or created != 0:
                            print(path, href, repr(name), kind, created)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                continue


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif not sys.argv[1:]:
        for index, counts in enumerate(collect()):
            print(index, dict(sorted(counts.items())))
    elif sys.argv[1:] == ["--root-probe"]:
        root_probe()
    else:
        raise SystemExit("usage: hwpx-ole-payload-oracle.py [--self-test|--root-probe]")
