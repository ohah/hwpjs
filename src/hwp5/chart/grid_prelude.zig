const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const types = @import("type_table.zig");
const requireType = @import("type_checks.zig").require;
pub const Options = struct {
    types: types.Options = .{},
    max_bytes: usize = 64 * 1024 * 1024,
    max_cells: u32 = 1000000,
};
pub const Prelude = struct {
    prefix: [36]u8,
    root_prefix: u32,
    grid_prefix: u32,
    collection_prefix: u16,
    rows: u16,
    columns: u16,
    payload_offset: usize,
    types: types.Table,
    pub fn deinit(self: *Prelude) void {
        self.types.deinit();
        self.* = undefined;
    }
};

/// Explicit observed VtChart v6 / grid-base v1 layout. Owns prefix and type names.
/// Does not search strings, interpret opaque prefix fields, or consume cells.
/// Caller must retain the original Contents separately to continue at payload_offset.
pub fn readObservedV6(a: std.mem.Allocator, bytes: []const u8, options: Options) !Prelude {
    if (bytes.len > options.max_bytes) return error.LimitExceeded;
    var reader: Reader = .{ .bytes = bytes };
    const prefix = try reader.take(36);
    if (std.mem.readInt(u32, prefix[32..36], .little) != bytes.len - reader.offset)
        return error.InvalidChartExtent;
    var table = types.Table.init(a, options.types);
    errdefer table.deinit();
    const root_prefix = try reader.readInt(u32);
    try requireType(&table, &reader, "VtChart\x00", 6);
    const grid_prefix = try reader.readInt(u32);
    try requireType(&table, &reader, "VtDataGrid\x00", 1);
    try requireType(&table, &reader, "VtMatrix\x00", 1);
    try requireType(&table, &reader, "VtCollection\x00", 1);
    const collection_prefix = try reader.readInt(u16);
    try requireType(&table, &reader, "VtObject\x00", 1);
    const rows = try reader.readInt(u16);
    const columns = try reader.readInt(u16);
    if (@as(u32, rows) * columns > options.max_cells) return error.LimitExceeded;
    return .{ .prefix = prefix[0..36].*, .root_prefix = root_prefix, .grid_prefix = grid_prefix, .collection_prefix = collection_prefix, .rows = rows, .columns = columns, .payload_offset = reader.offset, .types = table };
}
