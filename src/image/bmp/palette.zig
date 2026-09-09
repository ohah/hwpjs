pub const Palette = struct {
    bytes: []const u8,
    entry_bytes: u8,
    pub fn init(bytes: []const u8, entry_bytes: u8) !Palette {
        if ((entry_bytes != 3 and entry_bytes != 4) or bytes.len % entry_bytes != 0) return error.InvalidBmpPalette;
        if (entry_bytes == 4) {
            var at: usize = 3;
            while (at < bytes.len) : (at += 4) if (bytes[at] != 0) return error.InvalidBmpReserved;
        }
        return .{ .bytes = bytes, .entry_bytes = entry_bytes };
    }
    pub fn count(self: Palette) usize {
        return self.bytes.len / self.entry_bytes;
    }
    pub fn rgba(self: Palette, index: u8) ![4]u8 {
        if (index >= self.count()) return error.InvalidBmpPaletteIndex;
        const at = @as(usize, index) * self.entry_bytes;
        return .{ self.bytes[at + 2], self.bytes[at + 1], self.bytes[at], 255 };
    }
};
