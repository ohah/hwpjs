const std = @import("std");
const shared = @import("table_cursor.zig");
pub const Table = struct {
    destination: u8,
    precision: u8,
    /// Exactly 64 values in wire zig-zag order, not raster order.
    raw: []const u8,
    pub fn value(self: Table, index: usize) ?u16 {
        if (index >= 64) return null;
        return if (self.precision == 0) self.raw[index] else std.mem.readInt(u16, self.raw[index * 2 ..][0..2], .big);
    }
    /// Use-site check; does not install a table or validate progressive lifetime.
    pub fn validateForFrame(self: Table, frame: @import("frame.zig").Frame) !void {
        if (frame.process.mode == .lossless) return error.UnsupportedJpegQuantizationProcess;
        if (frame.precision == 8 and self.precision != 0) return error.InvalidJpegQuantizationPrecision;
    }
};
pub const Iterator = struct {
    cursor: shared.Cursor,
    pub fn init(payload: []const u8, options: shared.Options) !Iterator {
        return .{ .cursor = try shared.Cursor.init(payload, options) };
    }
    pub fn next(self: *Iterator) !?Table {
        var r = (try self.cursor.begin()) orelse return null;
        const s = try shared.selector(try r.readInt(u8));
        const table: Table = .{ .destination = s.destination, .precision = s.high, .raw = try r.take(if (s.high == 0) 64 else 128) };
        for (0..64) |i| if (table.value(i).? == 0) return error.InvalidJpegQuantizationValue;
        self.cursor.commit(r);
        return table;
    }
};
