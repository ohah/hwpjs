const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const arrays = @import("array_header.zig");
pub const Block = struct { raw: [194]u8, array: arrays.Header, end: usize };

/// Selected post-CLineItem span; enclosing ownership and raw field semantics
/// are not inferred. Copies raw bytes and preserves both array words without
/// consuming elements. Failure preserves reader; discard both tables.
pub fn readObserved(reader: *Reader, types: *Types, objects: *Objects) !Block {
    var next = reader.*;
    const raw = (try next.take(194))[0..194].*;
    try requireType(types, &next, "VtObject\x00", 1);
    const array = try arrays.readObservedV1(&next, types, objects);
    reader.* = next;
    return .{ .raw = raw, .array = array, .end = next.offset };
}
