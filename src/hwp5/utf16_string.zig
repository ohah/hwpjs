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
    if (units > (candidate.bytes.len - candidate.offset) / 2) return error.UnexpectedEnd;
    const bytes = try candidate.take(@as(usize, units) * 2);
    reader.* = candidate;
    return bytes;
}
