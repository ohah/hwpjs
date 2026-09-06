const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const rows = try r.readInt(u16);
    const columns = try r.readInt(u16);
    const sizes = try core.hwp5.body.table.Rows.parse(try r.take(@as(usize, rows) * 2));
    if ((bytes.len - r.offset) % 8 != 0) return error.InvalidGridInput;
    const cells = try a.alloc(core.hwp5.table_grid.Rectangle, (bytes.len - r.offset) / 8);
    defer a.free(cells);
    for (cells) |*c| c.* = .{ .row = try r.readInt(u16), .column = try r.readInt(u16), .row_span = try r.readInt(u16), .column_span = try r.readInt(u16) };
    try core.hwp5.table_grid.validate(a, rows, columns, sizes, cells);
    return a.alloc(u8, 0);
}
