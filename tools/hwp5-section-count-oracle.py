"""Read-only independent CFB/DocInfo inventory; never repairs input."""
import hashlib
import io
import json
import re
import sys
import zlib

import olefile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inspect(data):
    require(len(data) <= 64 * 1024 * 1024, "Input budget")
    with olefile.OleFileIO(io.BytesIO(data)) as container:
        streams = []
        total = 0
        for path in container.listdir(streams=True, storages=False):
            size = container.get_size(path)
            total += size
            require(size <= 32 * 1024 * 1024 and total <= 64 * 1024 * 1024, "Stream budget")
            content = container.openstream(path).read()
            require(len(content) == size, "Truncated stream")
            streams.append({"path": "/".join(path), "bytes": size, "sha256": hashlib.sha256(content).hexdigest()})
        header = container.openstream("FileHeader").read()
        require(len(header) >= 40, "Truncated header")
        flags = int.from_bytes(header[36:40], "little")
        info = container.openstream("DocInfo").read()
        if flags & 1:
            decoder = zlib.decompressobj(-15)
            info = decoder.decompress(info, 32 * 1024 * 1024 + 1)
            require(len(info) <= 32 * 1024 * 1024 and decoder.eof and not decoder.unconsumed_tail and not decoder.unused_data, "DocInfo DEFLATE framing")
        offset, properties = 0, []
        while offset < len(info):
            require(offset + 4 <= len(info), "Truncated record header")
            record = int.from_bytes(info[offset:offset + 4], "little")
            offset += 4
            size = record >> 20
            if size == 4095:
                require(offset + 4 <= len(info), "Truncated extended length")
                size = int.from_bytes(info[offset:offset + 4], "little")
                offset += 4
            require(offset + size <= len(info), "Truncated record payload")
            if record & 1023 == 16:
                require((record >> 10) & 1023 == 0 and size >= 2, "Document properties framing")
                properties.append({"offset": offset, "bytes": size, "sectionCount": int.from_bytes(info[offset:offset + 2], "little")})
            offset += size
        require(len(properties) == 1, "Unique document properties")
        sections = sorted(row["path"] for row in streams if re.fullmatch(r"BodyText/Section[0-9]+", row["path"]))
        require(sections, "Missing body sections")
        return {"inputSha256": hashlib.sha256(data).hexdigest(), "version": ".".join(str(value) for value in header[32:36][::-1]), "flags": flags, "properties": properties[0], "docInfoSha256": hashlib.sha256(info).hexdigest(), "bodySections": sections, "streams": streams}


if __name__ == "__main__":
    print(json.dumps(inspect(sys.stdin.buffer.read(64 * 1024 * 1024 + 1))))
