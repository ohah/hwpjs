const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const ids = @import("object_ids.zig");
const requireType = @import("type_checks.zig").require;
const arrays = @import("array_header.zig");
pub const Prefix = struct { object_id: u32, raw: [66]u8, array: arrays.Header, end: usize };

/// Selected Series v2 prefix only, not its body or array elements. Raw bytes
/// are copied and array words remain independent. On failure reader is
/// unchanged; caller must discard the possibly changed tables.
pub fn readObservedV2(reader: *Reader, types: *Types, objects: *Objects) !Prefix {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtSeries\x00", 2);
    const raw = (try next.take(66))[0..66].*;
    const array = try arrays.readObservedV1(&next, types, objects);
    reader.* = next;
    return .{ .object_id = id, .raw = raw, .array = array, .end = next.offset };
}
