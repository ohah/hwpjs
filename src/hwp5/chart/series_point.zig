const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
const labels = @import("series_label.zig");
pub const Point = struct { object_id: u32, label: labels.Label, raw: [20]u8, end: usize };

/// One observed SeriesPoint v1, without enclosing array/count inference.
/// Same lifetime and failure contract as SeriesLabel; raw20 has no assigned
/// field semantics. Common type handling accepts new and known declarations.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects, options: labels.Options) !Point {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtSeriesPoint\x00", 1);
    const label = try labels.readObservedV1(&next, types, objects, options);
    const raw = (try next.take(20))[0..20].*;
    try requireType(types, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .label = label, .raw = raw, .end = next.offset };
}
