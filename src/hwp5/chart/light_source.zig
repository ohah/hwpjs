const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
pub const Source = struct { object_id: u32, raw: [16]u8, start: usize, end: usize };

/// Inline VtInfLight3 v1. Copies bits, without assuming finite floats or units.
/// On failure reader is unchanged; discard both caller-owned tables.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects) !Source {
    var next = reader.*;
    const start = next.offset;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtInfLight3\x00", 1);
    const raw = (try next.take(16))[0..16].*;
    try requireType(types, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .raw = raw, .start = start, .end = next.offset };
}
