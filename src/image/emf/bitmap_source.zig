const std = @import("std");
const dib_colors = @import("dib_colors.zig");
const dib_payload = @import("dib_payload.zig");

pub const Fields = struct { bmi_offset: u32, bmi_size: u32, bits_offset: u32, bits_size: u32 };
pub const Source = struct {
    before_bmi: []const u8,
    bmi: []const u8,
    between_bmi_and_bits: []const u8,
    bits: []const u8,
    alignment_padding: []const u8,
    dib: dib_payload.Payload,
    semantic_end: usize,
};

pub fn parse(bytes: []const u8, fixed_end: usize, fields: Fields, usage: dib_colors.Usage) !?Source {
    if (fixed_end > bytes.len) return error.InvalidEmfBitmapSourceExtent;
    const absent = fields.bmi_offset == 0 and fields.bmi_size == 0 and fields.bits_offset == 0 and fields.bits_size == 0;
    if (absent) return null;
    if (fields.bmi_offset == 0 or fields.bmi_size == 0 or fields.bits_offset == 0 or fields.bits_size == 0)
        return error.IncompleteEmfBitmapSource;

    const bmi_start: u64 = fields.bmi_offset;
    const bmi_end = bmi_start + fields.bmi_size;
    const bits_start: u64 = fields.bits_offset;
    const bits_end = bits_start + fields.bits_size;
    if (bmi_start < fixed_end or bmi_end > bits_start or bits_end > bytes.len)
        return error.InvalidEmfBitmapSourceExtent;
    const aligned_end = std.mem.alignForward(u64, bits_end, 4);
    if (aligned_end > bytes.len) return error.InvalidEmfBitmapSourcePadding;

    const bmi = bytes[@intCast(bmi_start)..@intCast(bmi_end)];
    const bits = bytes[@intCast(bits_start)..@intCast(bits_end)];
    return .{
        .before_bmi = bytes[fixed_end..@intCast(bmi_start)],
        .bmi = bmi,
        .between_bmi_and_bits = bytes[@intCast(bmi_end)..@intCast(bits_start)],
        .bits = bits,
        .alignment_padding = bytes[@intCast(bits_end)..@intCast(aligned_end)],
        .dib = try dib_payload.parse(bmi, bits, usage, .{}),
        .semantic_end = @intCast(aligned_end),
    };
}

test "bitmap source permits both documented undefined spaces" {
    var bytes = [_]u8{0} ** 132;
    std.mem.writeInt(u32, bytes[104..108], 12, .little);
    std.mem.writeInt(u16, bytes[108..110], 2, .little);
    std.mem.writeInt(u16, bytes[110..112], 2, .little);
    std.mem.writeInt(u16, bytes[112..114], 1, .little);
    std.mem.writeInt(u16, bytes[114..116], 1, .little);
    const value = (try parse(&bytes, 100, .{ .bmi_offset = 104, .bmi_size = 18, .bits_offset = 124, .bits_size = 8 }, .rgb_colors)).?;
    try std.testing.expectEqual(@as(usize, 4), value.before_bmi.len);
    try std.testing.expectEqual(@as(usize, 2), value.between_bmi_and_bits.len);
    try std.testing.expectEqual(@as(u32, 2), value.dib.header.width);
}

test "bitmap source rejects partial overlap overflow and missing alignment" {
    const bytes = [_]u8{0} ** 132;
    try std.testing.expect((try parse(&bytes, 100, .{ .bmi_offset = 0, .bmi_size = 0, .bits_offset = 0, .bits_size = 0 }, .rgb_colors)) == null);
    try std.testing.expectError(error.IncompleteEmfBitmapSource, parse(&bytes, 100, .{ .bmi_offset = 104, .bmi_size = 18, .bits_offset = 0, .bits_size = 0 }, .rgb_colors));
    try std.testing.expectError(error.IncompleteEmfBitmapSource, parse(&bytes, 100, .{ .bmi_offset = 104, .bmi_size = 18, .bits_offset = 124, .bits_size = 0 }, .rgb_colors));
    try std.testing.expectError(error.InvalidEmfBitmapSourceExtent, parse(&bytes, 100, .{ .bmi_offset = 96, .bmi_size = 18, .bits_offset = 124, .bits_size = 8 }, .rgb_colors));
    try std.testing.expectError(error.InvalidEmfBitmapSourceExtent, parse(&bytes, 100, .{ .bmi_offset = 104, .bmi_size = 24, .bits_offset = 124, .bits_size = 8 }, .rgb_colors));
    try std.testing.expectError(error.InvalidEmfBitmapSourceExtent, parse(&bytes, 100, .{ .bmi_offset = 0xfffffff0, .bmi_size = 0x40, .bits_offset = 0xfffffff8, .bits_size = 8 }, .rgb_colors));
    try std.testing.expectError(error.InvalidEmfBitmapSourcePadding, parse(bytes[0..131], 100, .{ .bmi_offset = 104, .bmi_size = 18, .bits_offset = 124, .bits_size = 7 }, .palette_indices));
}
