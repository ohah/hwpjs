const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
const arrays = @import("array_header.zig");
pub const Prefix = struct { object_id: u32, initial: arrays.Header, raw: [136]u8, end: usize };

/// Selected Plot v4 prefix with an empty initial array, not the full Plot.
/// Does not infer raw field meanings or consume Light. Copies raw bytes.
/// Failure preserves reader; discard both potentially changed tables.
pub fn readObservedEmptyArrayV4(reader: *Reader, types: *Types, objects: *Objects) !Prefix {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtChartPlot\x00", 4);
    const initial = try arrays.readObservedV1(&next, types, objects);
    if (try initial.observedEqualCount(65535) != 0) return error.UnsupportedChartInitialArray;
    const raw = (try next.take(136))[0..136].*;
    reader.* = next;
    return .{ .object_id = id, .initial = initial, .raw = raw, .end = next.offset };
}
