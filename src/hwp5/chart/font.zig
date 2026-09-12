const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const strings = @import("string_object.zig");
const ids = @import("object_ids.zig");
pub const Font = struct { object_id: u32, name: strings.String, raw: [14]u8 };

/// Observed VtFont v1. Does not infer style/color semantics from API tables.
pub fn readObservedV1(reader: *Reader, table: *Table, max_name_bytes: usize) !Font {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try requireType(table, &next, "VtFont\x00", 1);
    const name = try strings.readObservedV1(&next, table, max_name_bytes);
    try ids.requireUnique(&.{ id, name.object_id });
    const raw = (try next.take(14))[0..14].*;
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .name = name, .raw = raw };
}
