const std = @import("std");
pub const Header = struct {
    width: u32,
    height: u32,
    bit_depth: u8,
    color_type: u8,
    interlace: u8,
    pub fn parse(bytes: []const u8) !Header {
        if (bytes.len != 13) return error.InvalidPngHeader;
        const width = std.mem.readInt(u32, bytes[0..4], .big);
        const height = std.mem.readInt(u32, bytes[4..8], .big);
        const result: Header = .{ .width = width, .height = height, .bit_depth = bytes[8], .color_type = bytes[9], .interlace = bytes[12] };
        try result.validate();
        if (bytes[10] != 0 or bytes[11] != 0) return error.UnsupportedPngFormat;
        return result;
    }
    pub fn validate(self: Header) !void {
        if (self.width == 0 or self.height == 0 or self.width > 0x7fffffff or self.height > 0x7fffffff) return error.InvalidPngDimensions;
        const depth = self.bit_depth;
        const valid = switch (self.color_type) {
            0 => depth == 1 or depth == 2 or depth == 4 or depth == 8 or depth == 16,
            2, 4, 6 => depth == 8 or depth == 16,
            3 => depth == 1 or depth == 2 or depth == 4 or depth == 8,
            else => false,
        };
        if (!valid or self.interlace > 1) return error.UnsupportedPngFormat;
    }
    pub fn channels(self: Header) !u8 {
        try self.validate();
        return switch (self.color_type) {
            0, 3 => 1,
            2 => 3,
            4 => 2,
            6 => 4,
            else => unreachable,
        };
    }
    pub fn pixels(self: Header) u64 {
        return @as(u64, self.width) * self.height;
    }
    pub fn palette(self: Header, bytes: []const u8) !usize {
        if (bytes.len % 3 != 0) return error.InvalidPngPalette;
        const entries = bytes.len / 3;
        try self.validatePaletteCount(entries);
        return entries;
    }
    pub fn validatePaletteCount(self: Header, entries: usize) !void {
        try self.validate();
        if (self.color_type == 0 or self.color_type == 4) return error.InvalidPngPalette;
        if (entries == 0 or entries > 256) return error.InvalidPngPalette;
        if (self.color_type == 3 and entries > @as(usize, 1) << @as(u4, @intCast(self.bit_depth))) return error.InvalidPngPalette;
    }
};
