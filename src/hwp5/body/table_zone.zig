const Reader = @import("../../binary/reader.zig").Reader;
pub const Layout = enum { spec_column_first, observed_row_first };
pub const Bounds = struct { start_column: u16, start_row: u16, end_column: u16, end_row: u16 };
pub const Zone = struct {
    coordinates: [4]u16,
    border_fill_id: u16,
    pub fn read(r: *Reader) !Zone {
        var z: Zone = undefined;
        for (&z.coordinates) |*v| v.* = try r.readInt(u16);
        z.border_fill_id = try r.readInt(u16);
        return z;
    }
    /// Table 78 and paired HWP/HWPX disagree on coordinate order.
    pub fn view(self: Zone, layout: Layout) Bounds {
        const col: usize = if (layout == .spec_column_first) 0 else 1;
        const row = 1 - col;
        return .{ .start_column = self.coordinates[col], .start_row = self.coordinates[row], .end_column = self.coordinates[col + 2], .end_row = self.coordinates[row + 2] };
    }
};
pub const Zones = @import("../../binary/record_array.zig").Records(Zone, 10);
