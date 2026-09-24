"""Independent read-only OPF application/xml census for the local HWPX corpus.

This uses Python zipfile/ElementTree, not the Zig ZIP or XML implementations.
It checks syntax and counts; it does not validate HWPX XML schemas or meaning.
"""

import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


ROOTS = (
    Path("legacy/rust/crates/hwp-core/tests/fixtures"),
    Path("reference/rhwp/samples"),
)
OPF = "{http://www.idpf.org/2007/opf/}"
ENCRYPTION = "{urn:oasis:names:tc:opendocument:xmlns:manifest:1.0}encryption-data"
MAX_PACKAGE_BYTES = 25_000_000
MAX_ENTRY_BYTES = 128 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024


def empty():
    return dict(accepted=0, rejected_zip=0, encrypted=0, xml_items=0,
                external=0, duplicates=0, entries=0, bytes=0, elements=0,
                settings=0, masterpages=0)


def main():
    shards = [empty() for _ in range(8)]
    for root_index, root in enumerate(ROOTS):
        if not root.is_dir():
            raise FileNotFoundError(root)
        for path in root.rglob("*.hwpx"):
            relative = path.relative_to(root).as_posix().encode("utf-8")
            shard = shards[(sum(relative) + root_index) % len(shards)]
            if path.stat().st_size > MAX_PACKAGE_BYTES:
                raise ValueError("oracle package limit exceeded")
            try:
                with ZipFile(path) as archive:
                    if "META-INF/manifest.xml" in archive.namelist():
                        security = ET.fromstring(archive.read("META-INF/manifest.xml"))
                        if any(node.tag == ENCRYPTION for node in security.iter()):
                            shard["encrypted"] += 1
                            continue
                    opf = ET.fromstring(archive.read("Contents/content.hpf"))
                    seen = set()
                    total = 0
                    for item in opf.findall(OPF + "manifest/" + OPF + "item"):
                        if item.get("media-type") != "application/xml":
                            continue
                        shard["xml_items"] += 1
                        if item.get("isEmbeded") == "0":
                            shard["external"] += 1
                            continue
                        name = item.get("href")
                        if name in seen:
                            shard["duplicates"] += 1
                            continue
                        seen.add(name)
                        info = archive.getinfo(name)
                        if info.file_size > MAX_ENTRY_BYTES or info.file_size > MAX_TOTAL_BYTES - total:
                            raise ValueError("oracle XML byte limit exceeded")
                        data = archive.read(name)
                        document = ET.fromstring(data)
                        total += len(data)
                        shard["entries"] += 1
                        shard["bytes"] += len(data)
                        shard["elements"] += sum(1 for _ in document.iter())
                        shard["settings"] += name == "settings.xml"
                        shard["masterpages"] += name.startswith("Contents/masterpage")
                    shard["accepted"] += 1
            except BadZipFile:
                shard["rejected_zip"] += 1
    total = {key: sum(shard[key] for shard in shards) for key in shards[0]}
    print(json.dumps({"total": total, "shards": shards}, sort_keys=True))


if __name__ == "__main__":
    main()
