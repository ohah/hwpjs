const std = @import("std");
const pixels = @import("pixels.zig");
const Header = @import("header.zig").Header;
const transparency = @import("transparency.zig");
const palette_colours = @import("palette_colours.zig");

pub const Raster = struct {
    width: u32,
    height: u32,
    /// Owned top-down unassociated 8-bit RGBA; no ICC, gamma, or compositing.
    rgba: []u8,

    pub fn deinit(self: *Raster, a: std.mem.Allocator) void {
        a.free(self.rgba);
        self.* = undefined;
    }
};

pub fn requiredBytes(width: u32, height: u32, maximum: usize) !usize {
    if (width == 0 or height == 0 or width > 0x7fffffff or height > 0x7fffffff) return error.InvalidPngDimensions;
    const size = @as(u64, width) * height * 4;
    if (size > maximum or size > std.math.maxInt(usize)) return error.LimitExceeded;
    return @intCast(size);
}

pub fn fromDecoded(a: std.mem.Allocator, decoded: *const pixels.Decoded, max_rgba_bytes: usize) !Raster {
    const h = decoded.report.structure.header;
    try h.validate();
    const size = try requiredBytes(h.width, h.height, max_rgba_bytes);
    const expected_layout = try pixels.Layout.init(h, decoded.bytes.len);
    if (!std.meta.eql(expected_layout, decoded.layout) or expected_layout.bytes != decoded.bytes.len) return error.InvalidPngScanlineSize;
    const rgba = try a.alloc(u8, size);
    errdefer a.free(rgba);
    @memset(rgba, 0);
    const palette: ?*const palette_colours.Palette = if (decoded.palette) |*colours| colours else null;
    const alpha: ?*const transparency.Value = if (decoded.report.transparency) |*value| value else null;
    for (decoded.layout.passes[0..decoded.layout.count]) |pass| {
        if (pass.width == 0 or pass.height == 0) continue;
        var offset = pass.offset;
        for (0..pass.height) |row_number| {
            const row = decoded.bytes[offset + 1 ..][0..pass.row_bytes];
            for (0..pass.width) |column| {
                const pixel = try readPixel(h, row, column, palette, alpha);
                const x = pass.x + pass.dx * @as(u32, @intCast(column));
                const y = pass.y + pass.dy * @as(u32, @intCast(row_number));
                const start = (@as(usize, y) * h.width + x) * 4;
                @memcpy(rgba[start..][0..4], &pixel);
            }
            offset += 1 + pass.row_bytes;
        }
    }
    return .{ .width = h.width, .height = h.height, .rgba = rgba };
}

fn sampleAt(h: Header, row: []const u8, x: usize, channel: usize) u16 {
    if (h.bit_depth < 8) {
        const per_byte = 8 / h.bit_depth;
        const shift: u3 = @intCast(8 - h.bit_depth * (x % per_byte + 1));
        const mask: u8 = @intCast((@as(u16, 1) << @as(u4, @intCast(h.bit_depth))) - 1);
        return (row[x / per_byte] >> shift) & mask;
    }
    const channels: usize = switch (h.color_type) {
        0, 3 => 1,
        2 => 3,
        4 => 2,
        6 => 4,
        else => unreachable,
    };
    const position = (x * channels + channel) * (h.bit_depth / 8);
    return if (h.bit_depth == 8) row[position] else std.mem.readInt(u16, row[position..][0..2], .big);
}

fn eight(value: u16, depth: u8) u8 {
    if (depth == 8) return @intCast(value);
    const maximum: u32 = (@as(u32, 1) << @as(u5, @intCast(depth))) - 1;
    return @intCast((@as(u32, value) * 255 + maximum / 2) / maximum);
}

fn readPixel(h: Header, row: []const u8, x: usize, palette: ?*const palette_colours.Palette, alpha: ?*const transparency.Value) ![4]u8 {
    switch (h.color_type) {
        0 => {
            const gray = sampleAt(h, row, x, 0);
            const opacity: u8 = if (alpha) |value| switch (value.*) {
                .grayscale => |key| if (gray == key.value) 0 else 255,
                else => return error.InvalidPngTransparencyColor,
            } else 255;
            const scaled = eight(gray, h.bit_depth);
            return .{ scaled, scaled, scaled, opacity };
        },
        2 => {
            const r = sampleAt(h, row, x, 0);
            const g = sampleAt(h, row, x, 1);
            const b = sampleAt(h, row, x, 2);
            const opacity: u8 = if (alpha) |value| switch (value.*) {
                .truecolor => |key| if (r == key[0].value and g == key[1].value and b == key[2].value) 0 else 255,
                else => return error.InvalidPngTransparencyColor,
            } else 255;
            return .{ eight(r, h.bit_depth), eight(g, h.bit_depth), eight(b, h.bit_depth), opacity };
        },
        3 => {
            const index = sampleAt(h, row, x, 0);
            const colours = palette orelse return error.MissingPngPalette;
            if (index >= colours.count) return error.InvalidPngPaletteIndex;
            const rgb = colours.entries[index];
            const opacity: u8 = if (alpha) |value| switch (value.*) {
                .indexed => |table| table.alpha[index],
                else => return error.InvalidPngTransparencyColor,
            } else 255;
            return .{ rgb[0], rgb[1], rgb[2], opacity };
        },
        4 => {
            const gray = eight(sampleAt(h, row, x, 0), h.bit_depth);
            return .{ gray, gray, gray, eight(sampleAt(h, row, x, 1), h.bit_depth) };
        },
        6 => return .{ eight(sampleAt(h, row, x, 0), h.bit_depth), eight(sampleAt(h, row, x, 1), h.bit_depth), eight(sampleAt(h, row, x, 2), h.bit_depth), eight(sampleAt(h, row, x, 3), h.bit_depth) },
        else => unreachable,
    }
}
