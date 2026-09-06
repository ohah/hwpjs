const Reader = @import("../binary/reader.zig").Reader;

/// Length-prefixed UTF-16LE wire bytes. Preserve NULs and unpaired surrogates;
/// presentation-layer decoding must choose its own invalid-Unicode policy.
pub fn read(reader: *Reader) ![]const u8 {
    return readCounted(u16, reader);
}

/// DWORD code-unit count, shared by Scripts and XMLTemplate; no terminator/padding.
pub fn read32(reader: *Reader) ![]const u8 {
    return readCounted(u32, reader);
}

fn readCounted(comptime Count: type, reader: *Reader) ![]const u8 {
    var candidate = reader.*;
    const units = try candidate.readInt(Count);
    const bytes = try readUnits(&candidate, units);
    reader.* = candidate;
    return bytes;
}

/// An externally established code-unit count; does not read a length prefix.
pub fn readUnits(reader: *Reader, units: usize) ![]const u8 {
    if (reader.offset > reader.bytes.len or units > (reader.bytes.len - reader.offset) / 2) return error.UnexpectedEnd;
    return reader.take(units * 2);
}
