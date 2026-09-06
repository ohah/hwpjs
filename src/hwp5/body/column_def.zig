const Reader = @import("../../binary/reader.zig").Reader;
pub const control_id: u32 = 0x636f6c64;
pub const Column = struct {
    width: u16,
    gap: u16,
    pub fn read(r: *Reader) !Column {
        return .{ .width = try r.readInt(u16), .gap = try r.readInt(u16) };
    }
};
pub const Columns = @import("../../binary/record_array.zig").Records(Column, 4);
pub const Definition = struct {
    flags_low: u16,
    flags_high: u16,
    spacing: ?i16,
    columns: ?Columns,
    line_type: u8,
    line_width: u8,
    color: u32,
    extra: []const u8,
    pub fn count(self: Definition) u8 {
        return @truncate(self.flags_low >> 2);
    }
    pub fn sameWidth(self: Definition) bool {
        return self.flags_low & 0x1000 != 0;
    }
    pub fn kind(self: Definition) u2 {
        return @truncate(self.flags_low);
    }
    pub fn direction(self: Definition) u2 {
        return @truncate(self.flags_low >> 10);
    }
    pub fn flags(self: Definition) u32 {
        return @as(u32, self.flags_high) << 16 | self.flags_low;
    }
    /// Observed cold properties; variable columns store width/gap pairs.
    pub fn parse(bytes: []const u8) !Definition {
        var r: Reader = .{ .bytes = bytes };
        var d: Definition = undefined;
        d.flags_low = try r.readInt(u16);
        if (d.count() == 0) return error.InvalidColumnCount;
        d.spacing = null;
        d.columns = null;
        if (d.count() < 2 or d.sameWidth()) {
            d.spacing = try r.readInt(i16);
            d.flags_high = try r.readInt(u16);
        } else {
            d.flags_high = try r.readInt(u16);
            d.columns = try Columns.parse(try r.take(@as(usize, d.count()) * 4));
        }
        d.line_type = try r.readInt(u8);
        d.line_width = try r.readInt(u8);
        d.color = try r.readInt(u32);
        d.extra = bytes[r.offset..];
        return d;
    }
};
