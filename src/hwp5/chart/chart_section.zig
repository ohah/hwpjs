const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const backdrops = @import("backdrop.zig");
const Objects = @import("object_table.zig").Table;
pub const Section = struct { raw: [26]u8, backdrop: backdrops.Backdrop, end: usize };

/// Observed base-class payload: no leading object ID. Empty Picture only.
/// Failure preserves reader; caller must discard the possibly modified table.
pub fn readObservedV1(reader: *Reader, table: *Table) !Section {
    return read(reader, table, null);
}

/// Same selected base body with the whole preceding identity scope. Failure
/// preserves reader; caller must discard both potentially changed tables.
pub fn readObservedWithObjects(reader: *Reader, table: *Table, objects: *Objects) !Section {
    return read(reader, table, objects);
}

fn read(reader: *Reader, table: *Table, objects: ?*Objects) !Section {
    var next = reader.*;
    try requireType(table, &next, "VtChartSection\x00", 1);
    const raw = (try next.take(26))[0..26].*;
    const backdrop = if (objects) |o| try backdrops.readObservedEmptyPictureWithObjects(&next, table, o) else try backdrops.readObservedEmptyPicture(&next, table);
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .raw = raw, .backdrop = backdrop, .end = next.offset };
}
