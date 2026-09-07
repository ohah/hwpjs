const std = @import("std");
const Header = @import("header.zig").Header;
pub const Sample = struct { raw: u16, value: u16 };
pub const Palette = struct { alpha: [256]u8 = @splat(255), count: u16 };
pub const Value = union(enum) { grayscale: Sample, truecolor: [3]Sample, indexed: Palette };

/// Owned values, no borrowed payload. Unspecified palette alpha is opaque.
pub fn parse(h: Header, palette_entries: usize, bytes: []const u8) !Value {
    try h.validate();
    switch (h.color_type) {
        0 => {
            if (bytes.len != 2) return error.InvalidPngTransparencySize;
            return .{ .grayscale = sample(bytes[0..2], h.bit_depth) };
        },
        2 => {
            if (bytes.len != 6) return error.InvalidPngTransparencySize;
            return .{ .truecolor = .{ sample(bytes[0..2], h.bit_depth), sample(bytes[2..4], h.bit_depth), sample(bytes[4..6], h.bit_depth) } };
        },
        3 => {
            if (palette_entries == 0 or palette_entries > @as(usize, 1) << @as(u4, @intCast(h.bit_depth))) return error.InvalidPngPalette;
            if (bytes.len > palette_entries) return error.InvalidPngTransparencySize;
            var result: Palette = .{ .count = @intCast(bytes.len) };
            @memcpy(result.alpha[0..bytes.len], bytes);
            return .{ .indexed = result };
        },
        else => return error.InvalidPngTransparencyColor,
    }
}
fn sample(bytes: *const [2]u8, depth: u8) Sample {
    const raw = std.mem.readInt(u16, bytes, .big);
    const mask: u16 = @intCast((@as(u32, 1) << @as(u5, @intCast(depth))) - 1);
    return .{ .raw = raw, .value = raw & mask };
}
