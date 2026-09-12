const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
pub const Item = struct { object_id: u32, raw: [52]u8, end: usize };

/// One selected CLineItem v1. Copies raw bytes without assigning field meaning.
/// No preceding word/count or enclosing ownership inference. On failure the
/// reader is unchanged; caller must discard the possibly changed tables.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects) !Item {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtCLineItem\x00", 1);
    const raw = (try next.take(52))[0..52].*;
    try requireType(types, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .raw = raw, .end = next.offset };
}
