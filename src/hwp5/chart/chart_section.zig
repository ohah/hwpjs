const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const backdrops = @import("backdrop.zig");
pub const Section = struct { raw: [26]u8, backdrop: backdrops.Backdrop, end: usize };

/// Observed base-class payload: no leading object ID. Empty Picture only.
/// Failure preserves reader; caller must discard the possibly modified table.
pub fn readObservedV1(reader: *Reader, table: *Table) !Section {
    var next = reader.*;
    try requireType(table, &next, "VtChartSection\x00", 1);
    const raw = (try next.take(26))[0..26].*;
    const backdrop = try backdrops.readObservedEmptyPicture(&next, table);
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .raw = raw, .backdrop = backdrop, .end = next.offset };
}
