const Header = @import("header.zig").Header;
const sample = @import("sample.zig");
pub const Sample = sample.Sample;
pub const Palette = struct { alpha: [256]u8 = @splat(255), count: u16 };
pub const Value = union(enum) { grayscale: Sample, truecolor: [3]Sample, indexed: Palette };

/// Owned values, no borrowed payload. Unspecified palette alpha is opaque.
pub fn parse(h: Header, palette_entries: usize, bytes: []const u8) !Value {
    try h.validate();
    switch (h.color_type) {
        0 => {
            if (bytes.len != 2) return error.InvalidPngTransparencySize;
            return .{ .grayscale = try sample.read(bytes[0..2], h.bit_depth) };
        },
        2 => {
            if (bytes.len != 6) return error.InvalidPngTransparencySize;
            return .{ .truecolor = .{ try sample.read(bytes[0..2], h.bit_depth), try sample.read(bytes[2..4], h.bit_depth), try sample.read(bytes[4..6], h.bit_depth) } };
        },
        3 => {
            try h.validatePaletteCount(palette_entries);
            if (bytes.len > palette_entries) return error.InvalidPngTransparencySize;
            var result: Palette = .{ .count = @intCast(bytes.len) };
            @memcpy(result.alpha[0..bytes.len], bytes);
            return .{ .indexed = result };
        },
        else => return error.InvalidPngTransparencyColor,
    }
}
