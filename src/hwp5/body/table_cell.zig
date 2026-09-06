const Reader = @import("../../binary/reader.zig").Reader;
/// Table 80 only, after an explicitly selected ListHeader view.
pub const Cell = struct {
    column: u16,
    row: u16,
    column_span: u16,
    row_span: u16,
    width: u32,
    height: u32,
    margins: [4]i16,
    border_fill_id: u16,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Cell {
        var r: Reader = .{ .bytes = bytes };
        var c: Cell = undefined;
        c.column = try r.readInt(u16);
        c.row = try r.readInt(u16);
        c.column_span = try r.readInt(u16);
        c.row_span = try r.readInt(u16);
        c.width = try r.readInt(u32);
        c.height = try r.readInt(u32);
        for (&c.margins) |*m| m.* = try r.readInt(i16);
        c.border_fill_id = try r.readInt(u16);
        c.extra = bytes[r.offset..];
        return c;
    }
};
