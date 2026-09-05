const Reader = @import("../binary/reader.zig").Reader;

/// Length-prefixed UTF-16LE wire bytes. Preserve NULs and unpaired surrogates;
/// presentation-layer decoding must choose its own invalid-Unicode policy.
pub fn read(reader: *Reader) ![]const u8 {
    var candidate = reader.*;
    const units = try candidate.readInt(u16);
    const bytes = try candidate.take(@as(usize, units) * 2);
    reader.* = candidate;
    return bytes;
}
