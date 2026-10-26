//! New unmerged tables only. Never rebuild existing opaque table records here.
const std = @import("std");
const Model = @import("../../model/created_table.zig").Table;
const Version = @import("../version.zig").Version;

pub const Options = struct {
    page_break: u2,
    repeat_header: bool,
    cell_spacing: i16,
    margins: [4]i16,
};

const Dimensions = struct { rows: u16, columns: u16, border: u16 };

fn dimensions(table: *const Model) !Dimensions {
    const rows = std.math.cast(u16, table.plan.rows) orelse return error.InvalidHwp5TableDimensions;
    const columns = std.math.cast(u16, table.plan.columns) orelse return error.InvalidHwp5TableDimensions;
    _ = try @import("../../model/table_creation_plan.zig").create(table.plan.rows, table.plan.columns, table.plan.width, table.plan.row_height, table.cells.len);
    if (table.cells.len != @as(usize, rows) * columns) return error.InvalidCreatedTableCells;
    return .{ .rows = rows, .columns = columns, .border = std.math.cast(u16, table.resources.border_fill) orelse return error.InvalidBorderFillReference };
}

fn put(comptime T: type, bytes: []u8, offset: *usize, value: T) void {
    std.mem.writeInt(T, bytes[offset.*..][0..@sizeOf(T)], value, .little);
    offset.* += @sizeOf(T);
}

/// HWPTAG_TABLE body only; framing, common control and child lists are separate.
pub fn writeTable(a: std.mem.Allocator, table: *const Model, version: Version, options: Options, limit: usize) ![]u8 {
    try version.requireSupported();
    const size = try dimensions(table);
    if (options.page_break == 3) return error.InvalidTableCreationPolicy;
    const modern = version.raw >= 0x05000100;
    const length = 20 + @as(usize, size.rows) * 2 + @as(usize, if (modern) 2 else 0);
    if (length > limit) return error.LimitExceeded;
    const bytes = try a.alloc(u8, length);
    var offset: usize = 0;
    put(u32, bytes, &offset, @as(u32, options.page_break) | (@as(u32, @intFromBool(options.repeat_header)) << 2));
    put(u16, bytes, &offset, size.rows);
    put(u16, bytes, &offset, size.columns);
    put(i16, bytes, &offset, options.cell_spacing);
    for (options.margins) |margin| put(i16, bytes, &offset, margin);
    for (0..size.rows) |_| put(u16, bytes, &offset, size.columns);
    put(u16, bytes, &offset, size.border);
    // A new unmerged table has no valid-zone overrides. Old wire omits count.
    if (modern) put(u16, bytes, &offset, 0);
    std.debug.assert(offset == bytes.len);
    return bytes;
}

/// Table 80 only. Caller owns the explicitly selected ListHeader layout.
pub fn writeCell(table: *const Model, row: u32, column: u32, margins: [4]i16) ![26]u8 {
    const size = try dimensions(table);
    const cell = try table.plan.cell(row, column);
    var bytes: [26]u8 = undefined;
    var offset: usize = 0;
    put(u16, &bytes, &offset, @intCast(cell.column));
    put(u16, &bytes, &offset, @intCast(cell.row));
    put(u16, &bytes, &offset, 1);
    put(u16, &bytes, &offset, 1);
    put(u32, &bytes, &offset, cell.width);
    put(u32, &bytes, &offset, cell.height);
    for (margins) |margin| put(i16, &bytes, &offset, margin);
    put(u16, &bytes, &offset, size.border);
    std.debug.assert(offset == bytes.len);
    return bytes;
}
