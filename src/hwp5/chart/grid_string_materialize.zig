const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Cell = @import("grid_cells.zig").Cell;
const ids = @import("object_ids.zig");

pub fn replacement(a: std.mem.Allocator, chart: *const Contents, cell: *const Cell, object_id: u32, string_type_id: u32, value_type_id: u32, bytes: []const u8, trailer: u8) ![]u8 {
    if (cell.value != .empty) return error.ExpectedNullChartCell;
    if (cell.start > cell.end or cell.end > chart.source.len or cell.end - cell.start != 4 or
        std.mem.readInt(u32, chart.source[cell.start..][0..4], .little) != 0xffffffff) return error.InvalidChartGridCellSpan;
    if (bytes.len > std.math.maxInt(u16)) return error.LimitExceeded;
    try ids.requireInline(object_id);
    if (chart.prefix.objects.entries.contains(object_id)) return error.DuplicateChartObjectId;
    const types = &chart.prefix.grid.prelude.types;
    if (string_type_id == 0xffffffff or value_type_id == 0xffffffff or string_type_id == value_type_id or
        types.definitions.contains(string_type_id) or types.definitions.contains(value_type_id)) return error.DuplicateChartTypeId;
    const object_type = types.findLowestId("VtObject\x00", 1) orelse return error.MissingChartStringForkType;
    const string_name = "VtString\x00";
    const value_name = "VtValue\x00";
    const output = try a.alloc(u8, bytes.len + 44);
    std.mem.writeInt(u32, output[0..4], object_id, .little);
    std.mem.writeInt(u32, output[4..8], string_type_id, .little);
    std.mem.writeInt(u16, output[8..10], string_name.len, .little);
    @memcpy(output[10..19], string_name);
    std.mem.writeInt(u16, output[19..21], 1, .little);
    std.mem.writeInt(u16, output[21..23], @intCast(bytes.len), .little);
    @memcpy(output[23..][0..bytes.len], bytes);
    output[23 + bytes.len] = trailer;
    std.mem.writeInt(u32, output[24 + bytes.len ..][0..4], value_type_id, .little);
    std.mem.writeInt(u16, output[28 + bytes.len ..][0..2], value_name.len, .little);
    @memcpy(output[30 + bytes.len ..][0..8], value_name);
    std.mem.writeInt(u16, output[38 + bytes.len ..][0..2], 1, .little);
    std.mem.writeInt(u32, output[40 + bytes.len ..][0..4], object_type, .little);
    return output;
}
