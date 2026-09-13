const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Cell = @import("grid_cells.zig").Cell;
const ids = @import("object_ids.zig");

pub fn replacement(a: std.mem.Allocator, chart: *const Contents, cell: *const Cell, object_id: u32, number_type_id: u32, value_type_id: u32, bits: u64, trailer: u16) ![]u8 {
    if (cell.value != .empty) return error.ExpectedNullChartCell;
    if (cell.start > cell.end or cell.end > chart.source.len or cell.end - cell.start != 4 or
        std.mem.readInt(u32, chart.source[cell.start..][0..4], .little) != 0xffffffff) return error.InvalidChartGridCellSpan;
    try ids.requireInline(object_id);
    if (chart.prefix.objects.entries.contains(object_id)) return error.DuplicateChartObjectId;
    const types = &chart.prefix.grid.prelude.types;
    if (number_type_id == 0xffffffff or value_type_id == 0xffffffff or number_type_id == value_type_id or
        types.definitions.contains(number_type_id) or types.definitions.contains(value_type_id)) return error.DuplicateChartTypeId;
    const object_type = types.findLowestId("VtObject\x00", 1) orelse return error.MissingChartNumberType;
    const number_name = "VtDouble\x00";
    const value_name = "VtValue\x00";
    const output = try a.alloc(u8, 51);
    std.mem.writeInt(u32, output[0..4], object_id, .little);
    std.mem.writeInt(u32, output[4..8], number_type_id, .little);
    std.mem.writeInt(u16, output[8..10], number_name.len, .little);
    @memcpy(output[10..19], number_name);
    std.mem.writeInt(u16, output[19..21], 1, .little);
    std.mem.writeInt(u64, output[21..29], bits, .little);
    std.mem.writeInt(u16, output[29..31], trailer, .little);
    std.mem.writeInt(u32, output[31..35], value_type_id, .little);
    std.mem.writeInt(u16, output[35..37], value_name.len, .little);
    @memcpy(output[37..45], value_name);
    std.mem.writeInt(u16, output[45..47], 1, .little);
    std.mem.writeInt(u32, output[47..51], object_type, .little);
    return output;
}
