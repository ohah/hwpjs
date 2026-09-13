const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
pub const Header = struct { raw_word: u16, end: usize };

/// Collection TYPE position, not an inline identity. No count interpretation.
/// Failure preserves reader; discard the potentially changed type table.
pub fn readObservedV1(reader: *Reader, types: *Types) !Header {
    var next = reader.*;
    try requireType(types, &next, "VtCollection\x00", 1);
    const word = try next.readInt(u16);
    try requireType(types, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .raw_word = word, .end = next.offset };
}
