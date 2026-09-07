const Header = @import("header.zig").Header;
const sample = @import("sample.zig");
pub const Value = union(enum) { grayscale: sample.Sample, truecolor: [3]sample.Sample, indexed: u8 };
pub fn parse(h: Header, palette_entries: usize, bytes: []const u8) !Value {
    try h.validate();
    switch (h.color_type) {
        0, 4 => {
            if (bytes.len != 2) return error.InvalidPngBackgroundSize;
            return .{ .grayscale = try sample.read(bytes[0..2], h.bit_depth) };
        },
        2, 6 => {
            if (bytes.len != 6) return error.InvalidPngBackgroundSize;
            return .{ .truecolor = .{ try sample.read(bytes[0..2], h.bit_depth), try sample.read(bytes[2..4], h.bit_depth), try sample.read(bytes[4..6], h.bit_depth) } };
        },
        3 => {
            try h.validatePaletteCount(palette_entries);
            if (bytes.len != 1) return error.InvalidPngBackgroundSize;
            if (bytes[0] >= palette_entries) return error.InvalidPngBackgroundIndex;
            return .{ .indexed = bytes[0] };
        },
        else => unreachable,
    }
}
