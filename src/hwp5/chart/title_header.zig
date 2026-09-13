const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const ids = @import("object_ids.zig");
const requireType = @import("type_checks.zig").require;
pub const Header = struct { object_id: u32, end: usize };

/// Inline Title identity and v1 class only, NOT its body. Failure preserves
/// reader; both potentially changed tables must be discarded.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects) !Header {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtChartTitle\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .end = next.offset };
}
