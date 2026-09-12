const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const values = @import("cell_value.zig");
const ids = @import("object_ids.zig");
pub const String = struct { object_id: u32, bytes: []const u8, trailer: u8 };

/// Borrows payload. Failure preserves reader; caller discards the type table.
pub fn readObservedV1(reader: *Reader, table: *Table, max_bytes: usize) !String {
    var next = reader.*;
    const id = try ids.readInline(&next);
    const name = "VtString\x00";
    try requireType(table, &next, name, 1);
    const value = (try values.read(&next, name, max_bytes)).string;
    try requireType(table, &next, "VtValue\x00", 1);
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .bytes = value.bytes, .trailer = value.trailer };
}
