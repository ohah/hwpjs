const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
const arrays = @import("array_header.zig");
pub const Prefix = struct { raw_before: [30]u8, object_id: u32, raw_body: [46]u8, array: arrays.Header, end: usize };

/// Selected raw30, SurfaceDesc v1/raw46 and empty following array. Array
/// ownership and full Surface boundary remain unresolved. No Axis consumed.
/// Copies raw bytes. Failure preserves reader; discard both tables.
pub fn readObservedEmptyArrayV1(reader: *Reader, types: *Types, objects: *Objects) !Prefix {
    var next = reader.*;
    const raw_before = (try next.take(30))[0..30].*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtSurfaceDesc\x00", 1);
    const raw_body = (try next.take(46))[0..46].*;
    const array = try arrays.readObservedV1(&next, types, objects);
    // Preserve existing selected-consumer errors: mismatch is Unsupported;
    // equal nonzero words exceed this consumer's zero-element limit.
    if (try array.observedEqualCount(0) != 0) return error.UnsupportedChartArrayLayout;
    reader.* = next;
    return .{ .raw_before = raw_before, .object_id = id, .raw_body = raw_body, .array = array, .end = next.offset };
}
