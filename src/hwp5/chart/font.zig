const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const strings = @import("string_object.zig");
const ids = @import("object_ids.zig");
const Objects = @import("object_table.zig").Table;
pub const Font = struct { object_id: u32, name: strings.String, raw: [14]u8, name_introduced: bool = true };

/// Observed VtFont v1. Does not infer style/color semantics from API tables.
pub fn readObservedV1(reader: *Reader, table: *Table, max_name_bytes: usize) !Font {
    return read(reader, table, max_name_bytes, null);
}
/// Registers the new Font and resolves its String through caller-owned scope.
/// On failure caller discards both tables; only the reader is rolled back.
pub fn readObservedWithObjects(reader: *Reader, table: *Table, objects: *Objects, max_name_bytes: usize) !Font {
    return read(reader, table, max_name_bytes, objects);
}
fn read(reader: *Reader, table: *Table, max_name_bytes: usize, objects: ?*Objects) !Font {
    var next = reader.*;
    const id = try ids.readInline(&next);
    if (objects) |o| try o.registerOther(id);
    try requireType(table, &next, "VtFont\x00", 1);
    var introduced = true;
    const name = if (objects) |o| blk: {
        const reference = try o.readStringObservedV1(&next, table, max_name_bytes);
        introduced = reference.introduced;
        break :blk reference.value;
    } else try strings.readObservedV1(&next, table, max_name_bytes);
    try ids.requireUnique(&.{ id, name.object_id });
    const raw = (try next.take(14))[0..14].*;
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .name = name, .raw = raw, .name_introduced = introduced };
}
