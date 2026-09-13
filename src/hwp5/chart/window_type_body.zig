const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
pub const Body = struct { raw_word: u16, end: usize };

/// Starts at the established Window TYPE position. Preceding identity and
/// whole-object boundary remain unresolved. No identity registration or EOF rule.
/// Failure preserves reader; discard the potentially changed type table.
pub fn readObservedV2(reader: *Reader, types: *Types) !Body {
    var next = reader.*;
    try requireType(types, &next, "VtWindow\x00", 2);
    try requireType(types, &next, "VtObject\x00", 1);
    const word = try next.readInt(u16);
    reader.* = next;
    return .{ .raw_word = word, .end = next.offset };
}
