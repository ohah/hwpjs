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
        if (width == 0 or height == 0 or width > 0x7fffffff or height > 0x7fffffff) return error.InvalidPngDimensions;
        const depth = bytes[8];
        const valid = switch (bytes[9]) {
            0 => depth == 1 or depth == 2 or depth == 4 or depth == 8 or depth == 16,
            2, 4, 6 => depth == 8 or depth == 16,
            3 => depth == 1 or depth == 2 or depth == 4 or depth == 8,
            else => false,
        };
        if (!valid or bytes[10] != 0 or bytes[11] != 0 or bytes[12] > 1) return error.UnsupportedPngFormat;
        return .{ .width = width, .height = height, .bit_depth = depth, .color_type = bytes[9], .interlace = bytes[12] };
    }
    pub fn pixels(self: Header) u64 {
        return @as(u64, self.width) * self.height;
    }
    pub fn palette(self: Header, bytes: []const u8) !usize {
        if (self.color_type == 0 or self.color_type == 4) return error.InvalidPngPalette;
        if (bytes.len == 0 or bytes.len % 3 != 0 or bytes.len > 768) return error.InvalidPngPalette;
        const entries = bytes.len / 3;
        if (self.color_type == 3 and entries > @as(usize, 1) << @as(u4, @intCast(self.bit_depth))) return error.InvalidPngPalette;
        return entries;
    }
};
