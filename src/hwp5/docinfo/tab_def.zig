const Reader = @import("../../binary/reader.zig").Reader;
pub const Tab = struct { position: u32, kind: u8, fill: u8, reserved: u16 };
pub const TabDef = struct {
    attributes: u32,
    /// Borrowed rows, checked once; no allocation controlled by input count.
    rows: []const u8,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !TabDef {
        var r: Reader = .{ .bytes = bytes };
        const attributes = try r.readInt(u32);
        const n = try r.readInt(u32);
        if (n > (bytes.len - r.offset) / 8) return error.UnexpectedEnd;
        const rows = try r.take(@as(usize, n) * 8);
        return .{ .attributes = attributes, .rows = rows, .extra = bytes[r.offset..] };
    }
    pub fn count(self: TabDef) usize {
        return self.rows.len / 8;
    }
    pub fn get(self: TabDef, index: usize) ?Tab {
        if (index >= self.count()) return null;
        var r: Reader = .{ .bytes = self.rows[index * 8 ..][0..8] };
        return .{ .position = r.readInt(u32) catch unreachable, .kind = r.readInt(u8) catch unreachable, .fill = r.readInt(u8) catch unreachable, .reserved = r.readInt(u16) catch unreachable };
    }
};
