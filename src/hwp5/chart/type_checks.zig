const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const types = @import("type_table.zig");

/// Internal compound-parser helper. On mismatch the caller discards its local table.
pub fn require(table: *types.Table, reader: *Reader, name: []const u8, version: u16) !void {
    const value = try table.readObserved16(reader);
    if (!std.mem.eql(u8, value.declaration.raw_name, name)) return error.UnsupportedChartClass;
    if (value.declaration.version != version) return error.UnsupportedChartTypeVersion;
}
