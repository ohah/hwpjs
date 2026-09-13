const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
const bodies = @import("text_block_body.zig");
pub const Options = bodies.Options;
pub const Label = struct { object_id: u32, body: bodies.Body, end: usize };

/// Selected inline SeriesLabel v1 with a TextBlock v2 base (no second ID).
/// Raw fields are copied; Strings borrow retained input. On failure reader is
/// unchanged, but caller must discard both possibly changed tables.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects, options: Options) !Label {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtSeriesLabel\x00", 1);
    const body = try bodies.readObservedV2(&next, types, objects, options);
    reader.* = next;
    return .{ .object_id = id, .body = body, .end = next.offset };
}
