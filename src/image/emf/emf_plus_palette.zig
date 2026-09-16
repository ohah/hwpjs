const std = @import("std");
const binary = @import("../../binary/reader.zig");
const argb = @import("emf_plus_argb.zig");
const values = @import("emf_plus_image_values.zig");

pub const Options = struct { max_entries: u32 = 1 << 20 };

pub const Palette = struct {
    style: values.PaletteStyle,
    count: u32,
    entry_bytes: []const u8,

    pub fn get(self: Palette, index: u32) !argb.Argb {
        if (index >= self.count) return error.EmfPlusPaletteIndexOutOfBounds;
        const offset = @as(usize, index) * 4;
        return argb.Argb.fromRaw(std.mem.readInt(u32, self.entry_bytes[offset..][0..4], .little));
    }
};

pub fn read(reader: *binary.Reader, options: Options) !Palette {
    var next = reader.*;
    const style = try values.PaletteStyle.parse(try next.readInt(u32));
    const count = try next.readInt(u32);
    if (count > options.max_entries) return error.LimitExceeded;
    const byte_count = std.math.mul(usize, @as(usize, count), 4) catch return error.LimitExceeded;
    const entry_bytes = try next.take(byte_count);
    const result: Palette = .{ .style = style, .count = count, .entry_bytes = entry_bytes };
    try validateStyle(result);
    reader.* = next;
    return result;
}

fn validateStyle(value: Palette) !void {
    var has_alpha = false;
    for (0..value.count) |index| {
        const entry = try value.get(@intCast(index));
        has_alpha = has_alpha or entry.alpha != 0xff;
        if (value.style.grayscale and (entry.red != entry.green or entry.green != entry.blue))
            return error.InvalidEmfPlusGrayscalePalette;
    }
    if (value.style.has_alpha and !has_alpha) return error.InvalidEmfPlusAlphaPalette;
}

test "EMF+ palette borrows ARGB entries and validates style claims" {
    var bytes = [_]u8{ 3, 0, 0, 0, 2, 0, 0, 0, 0x11, 0x11, 0x11, 0xff, 0x22, 0x22, 0x22, 0x80 };
    var reader: binary.Reader = .{ .bytes = &bytes };
    const palette = try read(&reader, .{});
    try std.testing.expectEqual(@as(u32, 2), palette.count);
    try std.testing.expectEqual(@as(u8, 0x80), (try palette.get(1)).alpha);
    try std.testing.expectError(error.EmfPlusPaletteIndexOutOfBounds, palette.get(2));

    bytes[11] = 0xff;
    bytes[15] = 0xff;
    reader.offset = 0;
    try std.testing.expectError(error.InvalidEmfPlusAlphaPalette, read(&reader, .{}));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    bytes[0] = 2;
    bytes[9] = 0x33;
    reader.offset = 0;
    try std.testing.expectError(error.InvalidEmfPlusGrayscalePalette, read(&reader, .{}));
}

test "EMF+ palette rejects every truncation count overflow and unknown style" {
    const bytes = [_]u8{ 0, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, 4 };
    for (0..bytes.len) |cut| {
        var reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, read(&reader, .{}));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
    var reader: binary.Reader = .{ .bytes = &bytes };
    try std.testing.expectError(error.LimitExceeded, read(&reader, .{ .max_entries = 0 }));
    var unknown = bytes;
    unknown[0] = 8;
    reader = .{ .bytes = &unknown };
    try std.testing.expectError(error.InvalidEmfPlusPaletteStyle, read(&reader, .{}));
}
