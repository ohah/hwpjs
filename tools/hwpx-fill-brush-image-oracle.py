#!/usr/bin/env python3
"""Independent OPF-ID census for raw HWPX fillBrush image leaves."""

from collections import Counter
import hashlib
import io
import os
from pathlib import Path
import re
import struct
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
IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".bmp", ".gif", ".wmf", ".tif", ".tiff", ".pcx", ".svg")


def manifest_image_candidate(item):
    return (item.get("media-type") or "").lower().startswith("image/") or (item.get("href") or "").lower().endswith(IMAGE_SUFFIXES)


def manifest_image_archive(archive):
    counts = Counter()
    items, _, parts = selected_items(archive)
    image_ids = set()
    for _, _, path in parts:
        root = ET.fromstring(archive.read(path))
        image_ids.update(leaf.get("binaryItemIDRef") for leaf in picture_leaves(root))
        image_ids.update(leaf.get("binaryItemIDRef") for _, leaf in image_leaves(root))
    for item in items:
        if not manifest_image_candidate(item):
            continue
        counts["sites"] += 1
        if item.get("isEmbeded") == "0":
            counts["external"] += 1
            continue
        counts["without_picture_brush_ref"] += item.get("id") not in image_ids
        href = item.get("href")
        info = archive.getinfo(href)
        if info.file_size > 64 * 1024 * 1024:
            counts["oversize"] += 1
            continue
        data = archive.read(href)
        kind = byte_format(data)
        if kind == "unknown" and ((item.get("media-type") or "").lower() in ("image/svg+xml", "image/svg") or href.lower().endswith(".svg")):
            kind = "svg"
        counts["targets"] += 1
        counts[kind] += 1
        counts["encoded_bytes"] += len(data)
        counts["media_mismatch"] += kind != "unknown" and not matching_media(kind, item.get("media-type"))
        if kind == "svg":
            counts["invalid_svg"] += svg_structure_status(data) != "ok"
    return counts


def collect_manifest_image_payloads():
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
                    document = manifest_image_archive(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                counts["unreadable"] += 1
            else:
                counts.update(document)
    return shards


def bmp_header_status(data):
    """Independent strict size check before Pillow's permissive pixel read."""
    if len(data) < 54 or data[:2] != b"BM" or struct.unpack_from("<I", data, 14)[0] != 40:
        return "unhandled"
    file_size = struct.unpack_from("<I", data, 2)[0]
    width = struct.unpack_from("<i", data, 18)[0]
    height = struct.unpack_from("<i", data, 22)[0]
    bits = struct.unpack_from("<H", data, 28)[0]
    compression = struct.unpack_from("<I", data, 30)[0]
    image_size = struct.unpack_from("<I", data, 34)[0]
    if compression != 0 or width <= 0 or height == 0:
        return "unhandled"
    expected_image_size = ((width * bits + 31) // 32) * 4 * abs(height)
    if file_size != len(data):
        return "file_size_rejected"
    if image_size not in (0, expected_image_size):
        return "image_size_rejected"
    return "ok"


def collect_bmp_pixels():
    """Optional independent Pillow check of embedded OPF BMP candidates."""
    from PIL import Image, ImageFile

    ImageFile.LOAD_TRUNCATED_IMAGES = False
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            try:
                with zipfile.ZipFile(path) as archive:
                    if encrypted(archive):
                        continue
                    items, _, _ = selected_items(archive)
                    for item in items:
                        if not manifest_image_candidate(item) or item.get("isEmbeded") == "0":
                            continue
                        data = archive.read(item.get("href"))
                        if byte_format(data) != "bmp":
                            continue
                        counts["bmp_candidates"] += 1
                        status = bmp_header_status(data)
                        if status != "ok":
                            counts["bmp_" + status] += 1
                            continue
                        try:
                            with Image.open(io.BytesIO(data)) as image:
                                rgba = image.convert("RGBA").tobytes()
                        except (OSError, ValueError) as exc:
                            counts["bmp_decode_errors"] += 1
                            print("Pillow BMP failure", path, item.get("href"), type(exc).__name__, str(exc), file=sys.stderr)
                            continue
                        counts["bmp_decoded"] += 1
                        counts["bmp_rgba_bytes"] += len(rgba)
                        counts["bmp_rgba_hash_u64"] = (counts["bmp_rgba_hash_u64"] +
                            int.from_bytes(hashlib.sha256(rgba).digest()[:8], "little")) & 0xffffffffffffffff
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                continue
    return shards


def jpeg_front(data):
    """Classify only the first APP marker, not full JPEG/JFIF validity."""
    if data[2:4] == bytes.fromhex("ffe0") and data[6:11] == bytes.fromhex("4a46494600"):
        return "jfif_first"
    if data[2:4] == bytes.fromhex("ffe1") and data[6:11] == bytes.fromhex("4578696600"):
        return "exif_first"
    return "other_first"


def jpeg_header_metadata(data):
    """Read marker payloads only until SOS; do not decode entropy or infer colour."""
    result = Counter()
    if not data.startswith(bytes.fromhex("ffd8")):
        return result
    at = 2
    while at < len(data):
        if data[at] != 0xff:
            break
        while at < len(data) and data[at] == 0xff:
            at += 1
        if at >= len(data):
            break
        code = data[at]
        at += 1
        if code == 0xda:
            break
        if code in (0xd8, 0xd9) or 0xd0 <= code <= 0xd7:
            continue
        if at + 2 > len(data):
            break
        size = int.from_bytes(data[at:at + 2], "big")
        if size < 2 or at + size > len(data):
            break
        payload = data[at + 2:at + size]
        at += size
        if code == 0xe0 and payload.startswith(b"JFIF\x00"):
            result["jfif_markers"] += 1
        if code == 0xee and payload.startswith(b"Adobe") and len(payload) >= 12:
            result["adobe_transform_" + str(payload[11])] += 1
        if 0xc0 <= code <= 0xcf and code not in (0xc4, 0xc8, 0xcc) and len(payload) >= 6:
            n = payload[5]
            if len(payload) >= 6 + n * 3:
                ids = tuple(payload[6 + i * 3] for i in range(n))
                result["component_ids_" + "_".join(map(str, ids))] += 1
    return result


def collect_jpeg_readiness():
    """Independent decoded-shape census before enabling JPEG pixels in HWPX."""
    from PIL import Image, ImageFile

    ImageFile.LOAD_TRUNCATED_IMAGES = False
    shards = [Counter() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        for path in root.rglob("*.hwpx"):
            shard = (root_index + sum(os.fsencode(str(path.relative_to(root))))) % 8
            counts = shards[shard]
            document_rgb_bytes = 0
            try:
                with zipfile.ZipFile(path) as archive:
                    if encrypted(archive):
                        continue
                    items, _, _ = selected_items(archive)
                    for item in items:
                        if not manifest_image_candidate(item) or item.get("isEmbeded") == "0":
                            continue
                        data = archive.read(item.get("href"))
                        if byte_format(data) != "jpeg":
                            continue
                        counts["candidates"] += 1
                        counts[jpeg_front(data)] += 1
                        header = jpeg_header_metadata(data)
                        counts.update(header)
                        counts["jfif_three_adobe_zero"] += bool(header["jfif_markers"] and header["component_ids_1_2_3"] and header["adobe_transform_0"])
                        try:
                            with Image.open(io.BytesIO(data)) as image:
                                image.load()
                                counts["pillow_decoded"] += 1
                                counts["mode_" + image.mode] += 1
                                counts["progressive"] += bool(image.info.get("progressive"))
                                rgb_bytes = image.width * image.height * 3
                                counts["rgb_bytes"] += rgb_bytes
                                document_rgb_bytes += rgb_bytes
                                counts["max_single_rgb_bytes"] = max(counts["max_single_rgb_bytes"], rgb_bytes)
                        except (OSError, ValueError):
                            counts["pillow_failed"] += 1
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                continue
            counts["documents"] += 1
            counts["max_document_rgb_bytes"] = max(counts["max_document_rgb_bytes"], document_rgb_bytes)
    return shards


def collect_exif_orientation():
    """Independent Pillow orientation census for Exif-first OPF JPEGs."""
    from PIL import Image

    counts = Counter()
    for root in ROOTS:
        for path in root.rglob("*.hwpx"):
            try:
                with zipfile.ZipFile(path) as archive:
                    if encrypted(archive):
                        continue
                    items, _, _ = selected_items(archive)
                    for item in items:
                        if not manifest_image_candidate(item) or item.get("isEmbeded") == "0":
                            continue
                        data = archive.read(item.get("href"))
                        if byte_format(data) != "jpeg" or jpeg_front(data) != "exif_first":
                            continue
                        counts["candidates"] += 1
                        try:
                            with Image.open(io.BytesIO(data)) as image:
                                value = image.getexif().get(274)
                        except (OSError, ValueError):
                            counts["pillow_failed"] += 1
                            continue
                        if value is None:
                            counts["orientation_missing"] += 1
                        elif isinstance(value, int) and 1 <= value <= 8:
                            counts[f"orientation_{value}"] += 1
                        else:
                            counts["orientation_invalid"] += 1
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                continue
    return counts


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


def picture_payload_archive(archive):
    counts = Counter()
    _, by_id, parts = selected_items(archive)
    seen = set()
    for source, _, href in parts:
        if source == "document" and href == "Contents/header.xml":
            continue
        for leaf in picture_leaves(ET.fromstring(archive.read(href))):
            counts[source + "_sites"] += 1
            pair = by_id.get(leaf.get("binaryItemIDRef"))
            if pair is None or pair[1].get("isEmbeded") == "0":
                counts[source + "_non_embedded"] += 1
                continue
            index, item = pair
            if (source, index) in seen:
                continue
            seen.add((source, index))
            target_href = item.get("href")
            if target_href not in archive.namelist():
                raise ValueError("missing embedded picture target")
            info = archive.getinfo(target_href)
            if info.file_size > 64 * 1024 * 1024:
                counts[source + "_oversize"] += 1
                continue
            data = archive.read(target_href)
            kind = byte_format(data)
            if kind == "unknown" and ((item.get("media-type") or "").lower() in ("image/svg+xml", "image/svg") or target_href.lower().endswith(".svg")):
                kind = "svg"
            counts[source + "_targets"] += 1
            counts[source + "_" + kind] += 1
            if kind == "unknown":
                counts[source + "_unknown_media_" + str(item.get("media-type"))] += 1
                counts[source + "_unknown_signature_" + data[:8].hex()] += 1
            counts[source + "_media_mismatch"] += kind != "unknown" and not matching_media(kind, item.get("media-type"))
            counts[source + "_encoded_bytes"] += len(data)
            if kind == "png":
                bad, malformed = png_defects(data)
                counts[source + "_invalid_png_targets"] += bad != 0 or malformed
                counts[source + "_bad_png_crc_chunks"] += bad
                counts[source + "_malformed_png_targets"] += malformed
            if kind == "wmf":
                counts[source + ("_wmf_placeable" if data.startswith(bytes.fromhex("d7cdc69a")) else "_wmf_standard")] += 1
                counts[source + "_invalid_wmf_targets"] += not wmf_framing_ok(data)
            if kind == "tiff":
                status = tiff_structure_status(data)
                counts[source + "_tiff_" + status] += 1
            if kind == "pcx":
                status = pcx_structure_status(data)
                counts[source + "_pcx_" + status] += 1
            if kind == "svg":
                if svg_structure_status(data) != "ok":
                    counts[source + "_invalid_svg_targets"] += 1
    return counts


def collect_picture_payloads():
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
                    document = picture_payload_archive(archive)
            except (zipfile.BadZipFile, KeyError, OSError, ET.ParseError, ValueError):
                counts["unreadable"] += 1
            else:
                counts.update(document)
    return shards


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
    if data.startswith(bytes.fromhex("d7cdc69a")) or (len(data) >= 4 and data[:2] in (b"\x01\0", b"\x02\0") and data[2:4] == b"\x09\0"):
        return "wmf"
    if data.startswith(bytes.fromhex("49492a00")) or data.startswith(bytes.fromhex("4d4d002a")):
        return "tiff"
    if len(data) >= 3 and data[0] == 10 and (data[2] == 1 or data[1] in (0, 2, 3, 4, 5)):
        return "pcx"
    head = data.removeprefix(b"\xef\xbb\xbf").lstrip(b" \t\r\n")
    if head.startswith(b"<svg") and len(head) > 4 and head[4:5] in (b" ", b"\t", b"\r", b"\n", b">", b"/"):
        return "svg"
    return "unknown"


def matching_media(kind, media):
    return (media or "").lower() in {"png": ("image/png",), "jpeg": ("image/jpeg", "image/jpg"), "bmp": ("image/bmp",), "gif": ("image/gif",), "wmf": ("image/wmf",), "tiff": ("image/tiff", "image/tif"), "pcx": ("image/pcx", "image/x-pcx", "image/vnd.zbrush.pcx"), "svg": ("image/svg+xml",)}.get(kind, ())


def svg_structure_status(data):
    if b"<!DOCTYPE" in data:
        return "dtd"
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return "xml"
    return "ok" if root.tag == "{http://www.w3.org/2000/svg}svg" else "root"


def pcx_structure_status(data):
    """Independent header and exact RLE-length check; pixels are not rendered."""
    if len(data) < 128:
        return "short_header"
    if data[0] != 10 or data[1] not in (0, 2, 3, 4, 5) or data[2] != 1 or data[3] not in (1, 2, 4, 8):
        return "header"
    x0, y0, x1, y1 = struct.unpack_from("<4H", data, 4)
    if x1 < x0 or y1 < y0:
        return "dimensions"
    planes = data[65]
    bpl = struct.unpack_from("<H", data, 66)[0]
    width = x1 - x0 + 1
    if not 1 <= planes <= 4 or bpl == 0 or bpl % 2 or bpl < (width * data[3] + 7) // 8:
        return "scanline"
    expected = (y1 - y0 + 1) * planes * bpl
    row_length = planes * bpl
    if expected > 256 * 1024 * 1024:
        return "limit"
    palette = data[1] == 5 and data[3] == 8 and planes == 1 and len(data) >= 128 + 769 and data[-769] == 12
    stream_end = len(data) - 769 if palette else len(data)
    decoded = 0
    cursor = 128
    while decoded < expected:
        if cursor == stream_end:
            return "truncated_image"
        code = data[cursor]
        cursor += 1
        if code & 0xC0 == 0xC0:
            count = code & 0x3F
            if count == 0:
                return "zero_run"
            if cursor == stream_end:
                return "truncated_run"
            cursor += 1
        else:
            count = 1
        if decoded + count > expected:
            return "overrun"
        if decoded % row_length + count > row_length:
            return "cross_scanline"
        decoded += count
    if cursor != stream_end:
        return "trailer"
    return "ok_palette" if palette else "ok"


def tiff_structure_status(data):
    """Independent classic-TIFF IFD and strip/tile extent oracle."""
    if len(data) < 8:
        return "short_header"
    endian = "<" if data[:4] == bytes.fromhex("49492a00") else ">" if data[:4] == bytes.fromhex("4d4d002a") else None
    if endian is None:
        return "signature"
    u16 = lambda pos: struct.unpack_from(endian + "H", data, pos)[0]
    u32 = lambda pos: struct.unpack_from(endian + "I", data, pos)[0]
    offset = u32(4)
    seen = set()
    while offset:
        if offset in seen:
            return "cycle"
        seen.add(offset)
        if len(seen) > 1024:
            return "ifd_limit"
        if offset < 8 or offset % 2 or offset + 2 > len(data):
            return "ifd_offset"
        count = u16(offset)
        end = offset + 2 + count * 12 + 4
        if count == 0 or end > len(data):
            return "ifd_extent"
        previous = -1
        ranges = {}
        for at in range(offset + 2, end - 4, 12):
            tag, typ, n = struct.unpack_from(endian + "HHI", data, at)
            if tag <= previous:
                return "tag_order"
            previous = tag
            width = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}.get(typ)
            if width is None:
                raw = None
            elif n * width <= 4:
                raw = data[at + 8:at + 8 + n * width]
            else:
                target = u32(at + 8)
                if target % 2 or target > len(data) or n * width > len(data) - target:
                    return "field_extent"
                raw = data[target:target + n * width]
            if tag in (273, 279, 324, 325):
                ranges[tag] = (typ, n, raw)
        for start_tag, size_tag in ((273, 279), (324, 325)):
            if start_tag not in ranges and size_tag not in ranges:
                continue
            if start_tag not in ranges or size_tag not in ranges:
                return "missing_data_pair"
            st, sn, sb = ranges[start_tag]
            lt, ln, lb = ranges[size_tag]
            if st not in (1, 3, 4) or lt not in (1, 3, 4) or sn == 0 or sn != ln or sn > 100000:
                return "data_type_or_count"
            fmt = {1: "B", 3: "H", 4: "I"}
            starts = struct.unpack(endian + str(sn) + fmt[st], sb)
            lengths = struct.unpack(endian + str(ln) + fmt[lt], lb)
            if any(a > len(data) or b > len(data) - a for a, b in zip(starts, lengths)):
                return "data_extent"
        offset = u32(end - 4)
    return "ok" if seen else "missing_ifd"


def wmf_framing_ok(data):
    """Independent strict META_HEADER/META_RECORD check; no payload semantics."""
    placeable = data.startswith(bytes.fromhex("d7cdc69a"))
    start = 22 if placeable else 0
    if len(data) < start + 24 or (len(data) - start) % 2:
        return False
    if placeable:
        words = [int.from_bytes(data[i:i + 2], "little") for i in range(0, 22, 2)]
        if any(data[16:20]):
            return False
        if words[10] != (words[0] ^ words[1] ^ words[2] ^ words[3] ^ words[4] ^ words[5] ^ words[6] ^ words[7] ^ words[8] ^ words[9]):
            return False
    u16 = lambda pos: int.from_bytes(data[pos:pos + 2], "little")
    u32 = lambda pos: int.from_bytes(data[pos:pos + 4], "little")
    if u16(start) not in (1, 2) or u16(start + 2) != 9 or u16(start + 4) not in (0x0100, 0x0300):
        return False
    if placeable and u16(start) == 2 and u16(4) != 0:
        return False
    if u32(start + 6) != (len(data) - start) // 2:
        return False
    declared_max = u32(start + 12)
    at = start + 18
    observed_max = 0
    while at + 6 <= len(data):
        size = u32(at)
        if size < 3 or size > (len(data) - at) // 2:
            return False
        observed_max = max(observed_max, size)
        fn = u16(at + 4)
        at += size * 2
        if fn == 0:
            return size == 3 and at == len(data) and observed_max == declared_max
    return False


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
            counts[source + "_media_mismatch"] += kind != "unknown" and not matching_media(kind, item.get("media-type"))
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
    assert jpeg_front(bytes.fromhex("ffd8ffe000104a46494600")) == "jfif_first"
    assert jpeg_front(bytes.fromhex("ffd8ffe100104578696600")) == "exif_first"
    assert jpeg_front(bytes.fromhex("ffd8ffdb0004")) == "other_first"
    assert jpeg_front(bytes.fromhex("ffd8ffdb00104a46494600")) == "other_first"
    jfif = bytes.fromhex("ffe000104a46494600010201000100010000")
    sof = bytes.fromhex("ffc00011080001000103") + bytes((0, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0))
    metadata = jpeg_header_metadata(bytes.fromhex("ffd8") + jfif + sof + bytes.fromhex("ffda0002"))
    assert metadata["jfif_markers"] == 1 and metadata["component_ids_0_2_3"] == 1
    tiny_bmp = bytearray(70)
    tiny_bmp[:2] = b"BM"
    struct.pack_into("<I", tiny_bmp, 2, 70)
    struct.pack_into("<I", tiny_bmp, 14, 40)
    struct.pack_into("<i", tiny_bmp, 18, 2)
    struct.pack_into("<i", tiny_bmp, 22, 2)
    struct.pack_into("<H", tiny_bmp, 28, 32)
    assert bmp_header_status(tiny_bmp) == "ok"
    struct.pack_into("<I", tiny_bmp, 2, 69)
    assert bmp_header_status(tiny_bmp) == "file_size_rejected"
    struct.pack_into("<I", tiny_bmp, 2, 70)
    struct.pack_into("<I", tiny_bmp, 34, 15)
    assert bmp_header_status(tiny_bmp) == "image_size_rejected"
    assert manifest_image_candidate(ET.Element("item", {"href": "BinData/unused.SVG", "media-type": "application/octet-stream"}))
    assert manifest_image_candidate(ET.Element("item", {"href": "BinData/unknown.bin", "media-type": "image/png"}))
    assert manifest_image_candidate(ET.Element("item", {"href": "BinData/upper.bin", "media-type": "IMAGE/PNG"}))
    assert not manifest_image_candidate(ET.Element("item", {"href": "BinData/unknown.bin", "media-type": "application/octet-stream"}))
    inventory_bytes = io.BytesIO()
    inventory_opf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='unused' href='BinData/unused.svg' media-type='application/octet-stream'/><o:item id='legacy' href='BinData/legacy.bin' media-type='IMAGE/SVG'/><o:item id='external' href='https://example.invalid/absent.png' media-type='image/png' isEmbeded='0'/><o:item id='other' href='BinData/other.bin' media-type='application/octet-stream'/></o:manifest><o:spine/></o:package>"
    with zipfile.ZipFile(inventory_bytes, "w") as archive:
        archive.writestr("Contents/content.hpf", inventory_opf)
        archive.writestr("BinData/unused.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>")
        archive.writestr("BinData/legacy.bin", "<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'/>")
        archive.writestr("BinData/other.bin", b"opaque")
    with zipfile.ZipFile(inventory_bytes) as archive:
        census = manifest_image_archive(archive)
    assert census["sites"] == 3 and census["external"] == 1 and census["targets"] == 2 and census["without_picture_brush_ref"] == 2
    assert census["svg"] == 2 and census["invalid_svg"] == 0 and census["media_mismatch"] == 2
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
        picture_payload_counts = picture_payload_archive(archive)
    assert [picture_counts["document_" + state] for state in ("embedded", "external", "missing", "empty", "absent")] == [1] * 5
    assert picture_counts["master_embedded"] == 1 and picture_counts["document_sites"] == 5
    assert picture_payload_counts["document_targets"] == 1 and picture_payload_counts["document_non_embedded"] == 4
    assert picture_payload_counts["master_targets"] == 1 and picture_payload_counts["master_encoded_bytes"] == 5
    assert picture_payload_counts["document_media_mismatch"] == 0 and picture_payload_counts["master_media_mismatch"] == 0
    assert byte_format(bytes.fromhex("89504e470d0a1a0a")) == "png"
    assert byte_format(bytes.fromhex("ffd8")) == "jpeg"
    assert byte_format(b"<svg xmlns='http://www.w3.org/2000/svg'/>") == "svg"
    assert byte_format(b"<svgOther/>") == "unknown"
    assert matching_media("svg", "image/svg+xml") and matching_media("svg", "IMAGE/SVG+XML") and not matching_media("svg", "image/svg")
    assert svg_structure_status(b"<svg xmlns='http://www.w3.org/2000/svg'/>") == "ok"
    assert svg_structure_status(b"<svg/>") == "root"
    assert svg_structure_status(b"<svg xmlns='http://www.w3.org/2000/svg'>") == "xml"
    assert svg_structure_status(b"<!DOCTYPE svg><svg xmlns='http://www.w3.org/2000/svg'/>") == "dtd"
    assert not matching_media("png", "image/jpg")
    standard_wmf = bytes.fromhex("0100090000030c0000000000030000000000030000000000")
    placeable_wmf = bytes.fromhex("d7cdc69a") + bytes(16) + bytes.fromhex("1157") + standard_wmf
    assert byte_format(standard_wmf) == byte_format(placeable_wmf) == "wmf"
    assert matching_media("wmf", "image/wmf") and not matching_media("wmf", "image/png")
    assert wmf_framing_ok(standard_wmf) and wmf_framing_ok(placeable_wmf)
    assert not wmf_framing_ok(standard_wmf[:-1])
    assert not wmf_framing_ok(standard_wmf[:-6] + bytes.fromhex("020000000000"))
    assert not wmf_framing_ok(standard_wmf[:6] + bytes(4) + standard_wmf[10:])
    assert not wmf_framing_ok(placeable_wmf[:28] + bytes(4) + placeable_wmf[32:])
    assert not wmf_framing_ok(placeable_wmf[:20] + b"\0\0" + placeable_wmf[22:])
    for endian, signature in (("<", bytes.fromhex("49492a00")), (">", bytes.fromhex("4d4d002a"))):
        tiny_tiff = signature + struct.pack(endian + "I", 8) + struct.pack(endian + "H", 2)
        tiny_tiff += struct.pack(endian + "HHII", 273, 4, 1, 38)
        tiny_tiff += struct.pack(endian + "HHII", 279, 4, 1, 4)
        tiny_tiff += struct.pack(endian + "I", 0) + b"data"
        assert byte_format(tiny_tiff) == "tiff" and tiff_structure_status(tiny_tiff) == "ok"
        assert tiff_structure_status(tiny_tiff[:-1]) == "data_extent"
        assert tiff_structure_status(tiny_tiff[:34] + struct.pack(endian + "I", 8) + tiny_tiff[38:]) == "cycle"
    assert matching_media("tiff", "image/tif") and not matching_media("tiff", "image/png")
    pcx = bytearray(128) + bytes((0xC2, 0xFF))
    pcx[0:4] = bytes((10, 5, 1, 1))
    struct.pack_into("<4H", pcx, 4, 0, 0, 8, 0)
    pcx[65] = 1
    struct.pack_into("<H", pcx, 66, 2)
    assert byte_format(pcx) == "pcx" and pcx_structure_status(pcx) == "ok"
    wrong_version = bytearray(pcx)
    wrong_version[1] = 6
    assert byte_format(wrong_version) == "pcx" and pcx_structure_status(wrong_version) == "header"
    assert matching_media("pcx", "image/pcx") and not matching_media("pcx", "image/png")
    assert pcx_structure_status(pcx[:-1]) == "truncated_run"
    pcx[128] = 0xC3
    assert pcx_structure_status(pcx) == "overrun"
    pcx[128] = 0xC0
    assert pcx_structure_status(pcx) == "zero_run"
    cross = bytearray(pcx[:128]) + bytes((0xC3, 1, 0xC1, 2))
    struct.pack_into("<H", cross, 10, 1)
    assert pcx_structure_status(cross) == "cross_scanline"
    palette = bytearray(pcx[:128]) + bytes((1, 2, 12)) + bytes(768)
    palette[3] = 8
    struct.pack_into("<H", palette, 8, 1)
    assert pcx_structure_status(palette) == "ok_palette"
    short_image = bytearray(palette[:128]) + bytes((1, 12)) + bytes(768)
    struct.pack_into("<H", short_image, 66, 770)
    assert pcx_structure_status(short_image) == "truncated_image"
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
    if sys.argv[1:] == ["--picture-payloads"]:
        for index, counts in enumerate(collect_picture_payloads()):
            print(index, dict(sorted(counts.items())))
        return
    if sys.argv[1:] == ["--manifest-images"]:
        for index, counts in enumerate(collect_manifest_image_payloads()):
            print(index, dict(sorted(counts.items())))
        return
    if sys.argv[1:] == ["--bmp-pixels"]:
        for index, counts in enumerate(collect_bmp_pixels()):
            print(index, dict(sorted(counts.items())))
        return
    if sys.argv[1:] == ["--jpeg-readiness"]:
        for index, counts in enumerate(collect_jpeg_readiness()):
            print(index, dict(sorted(counts.items())))
        return
    if sys.argv[1:] == ["--exif-orientation"]:
        print(dict(sorted(collect_exif_orientation().items())))
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: hwpx-fill-brush-image-oracle.py [--self-test|--payloads|--pictures|--picture-payloads|--manifest-images|--bmp-pixels|--jpeg-readiness|--exif-orientation]")
    for index, counts in enumerate(collect()):
        print(index, dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
