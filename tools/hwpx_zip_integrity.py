"""Bounded physical ZIP-member validation, independent of XML/slot policy.

ZipExtFile clamps output to the declared uncompressed size. Validate raw stored
bytes / raw DEFLATE streams instead, before any caller reads via ZipFile.
Only STORED and DEFLATED are supported; other codecs are explicitly rejected.
"""
import io
import struct
import zipfile
import zlib

CHUNK = 64 * 1024


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def member_payload(data, info, boundary):
    """Bind central directory identity/sizes to a bounded local member."""
    offset = info.header_offset
    require(0 <= offset <= boundary - 30, 'Invalid ZIP local header offset')
    header = struct.unpack_from('<4s5H3I2H', data, offset)
    signature, version, flags, method, time, date, crc, compressed, size, names, extra = header
    require(signature == b'PK\x03\x04', 'Invalid ZIP local signature')
    require(flags == info.flag_bits and method == info.compress_type, 'ZIP local/central flags or codec mismatch')
    require(not flags & 0x41, 'Encrypted ZIP member')
    require(method in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'Unsupported ZIP codec')
    start = offset + 30 + names + extra
    require(start <= boundary, 'Truncated ZIP local name/extra')
    raw_name = data[offset + 30:offset + 30 + names]
    require(b'\x00' not in raw_name, 'NUL in ZIP local name')
    name = raw_name.decode('utf-8' if flags & 0x800 else 'cp437', errors='strict')
    require(name == info.orig_filename == info.filename, 'ZIP local/central name mismatch')
    # ZIP64 local fields need separate decoding; do not guess their size/descriptor.
    require(compressed != 0xffffffff and size != 0xffffffff, 'Unsupported ZIP64 local sizes')
    if flags & 8:
        require(crc in (0, info.CRC) and compressed in (0, info.compress_size)
                and size in (0, info.file_size), 'ZIP descriptor local size/CRC mismatch')
    else:
        require((crc, compressed, size) == (info.CRC, info.compress_size, info.file_size),
                'ZIP local/central size or CRC mismatch')
    end = start + info.compress_size
    require(end <= boundary, 'Overlapping or truncated ZIP member')
    if flags & 8:
        descriptor = end
        if data[descriptor:descriptor + 4] == b'PK\x07\x08':
            descriptor += 4
        require(descriptor + 12 <= boundary, 'Missing ZIP data descriptor')
        require(struct.unpack_from('<3I', data, descriptor) == (info.CRC, info.compress_size, info.file_size),
                'ZIP data descriptor mismatch')
    return start, end


def validate_payload(data, info, start, end, remaining):
    limit = min(info.file_size, remaining)
    count = crc = 0

    def consume(output):
        nonlocal count, crc
        count += len(output)
        require(count <= limit, 'ZIP actual expansion/declared size exceeded')
        crc = zlib.crc32(output, crc)

    if info.compress_type == zipfile.ZIP_STORED:
        require(info.compress_size == info.file_size, 'STORED ZIP size mismatch')
        for at in range(start, end, CHUNK):
            consume(data[at:min(end, at + CHUNK)])
    else:
        inflater = zlib.decompressobj(-15)
        for at in range(start, end, CHUNK):
            pending = data[at:min(end, at + CHUNK)]
            while pending:
                consume(inflater.decompress(pending, min(CHUNK, limit - count + 1)))
                require(not inflater.unused_data, 'ZIP trailing data after DEFLATE EOF')
                pending = inflater.unconsumed_tail
        # max_length can leave buffered output even after consuming all input.
        # Drain it in bounded chunks; flush() without a hard bound is unsafe.
        while not inflater.eof:
            output = inflater.decompress(b'', min(CHUNK, limit - count + 1))
            consume(output)
            if not output:
                break
        require(inflater.eof and not inflater.unused_data and not inflater.unconsumed_tail,
                'Incomplete or trailing ZIP DEFLATE stream')
    require(count == info.file_size, 'ZIP actual size mismatch')
    require(crc == info.CRC, 'ZIP actual CRC mismatch')
    return count


def open_zip(data, *, max_input, max_expanded, max_members=4096):
    require(isinstance(data, bytes) and len(data) <= max_input, 'Invalid ZIP input/size')
    package = zipfile.ZipFile(io.BytesIO(data))
    try:
        entries = package.infolist()
        names = [i.filename for i in entries]
        require(len(entries) <= max_members and len(names) == len(set(names)), 'Ambiguous or oversized ZIP inventory')
        require(all('\x00' not in i.orig_filename and i.orig_filename == i.filename for i in entries),
                'NUL or normalized ZIP central name')
        require(all(not n.startswith('/') and '\\' not in n and '..' not in n.split('/') for n in names),
                'Unsafe ZIP member name')
        require(sum(i.file_size for i in entries) <= max_expanded, 'ZIP expansion limit')
        ordered = sorted(entries, key=lambda i: i.header_offset)
        require(len({i.header_offset for i in entries}) == len(entries), 'Duplicate ZIP local member owner')
        expanded = 0
        for index, info in enumerate(ordered):
            boundary = ordered[index + 1].header_offset if index + 1 < len(ordered) else package.start_dir
            require(boundary <= len(data), 'ZIP member outside archive')
            start, end = member_payload(data, info, boundary)
            expanded += validate_payload(data, info, start, end, max_expanded - expanded)
        return package
    except Exception:
        package.close()
        raise
