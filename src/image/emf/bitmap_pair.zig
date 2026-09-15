const std = @import("std");
const bitmap_object = @import("bitmap_object.zig");
const dib_colors = @import("dib_colors.zig");

pub const Pair = struct {
    source: bitmap_object.Object,
    mask: bitmap_object.Object,
    buffer: []const u8,
    alignment_padding: []const u8,
    data_end: usize,
    semantic_end: usize,
};

pub fn parse(bytes: []const u8, fixed_end: usize, source_fields: bitmap_object.Fields, source_usage: dib_colors.Usage, mask_fields: bitmap_object.Fields, mask_usage: dib_colors.Usage) !Pair {
    const source = (try bitmap_object.parse(bytes, fixed_end, source_fields, source_usage, .{})) orelse return error.MissingEmfBitmapPairSource;
    const mask = (try bitmap_object.parse(bytes, fixed_end, mask_fields, mask_usage, .{ .require_monochrome = true })) orelse return error.MissingEmfBitmapPairMask;
    if (!(source.data_end <= mask.start or mask.data_end <= source.start))
        return error.OverlappingEmfBitmapPair;
    const data_end = @max(source.data_end, mask.data_end);
    const semantic_end = std.mem.alignForward(usize, data_end, 4);
    if (semantic_end > bytes.len) return error.InvalidEmfBitmapPairPadding;
    return .{
        .source = source,
        .mask = mask,
        .buffer = bytes[fixed_end..semantic_end],
        .alignment_padding = bytes[data_end..semantic_end],
        .data_end = data_end,
        .semantic_end = semantic_end,
    };
}

test "bitmap pair accepts either source-mask order and rejects overlap" {
    var bytes = [_]u8{0} ** 168;
    for ([_]usize{ 128, 148 }) |at| {
        std.mem.writeInt(u32, bytes[at..][0..4], 12, .little);
        std.mem.writeInt(u16, bytes[at + 4 ..][0..2], 2, .little);
        std.mem.writeInt(u16, bytes[at + 6 ..][0..2], 2, .little);
        std.mem.writeInt(u16, bytes[at + 8 ..][0..2], 1, .little);
        std.mem.writeInt(u16, bytes[at + 10 ..][0..2], 1, .little);
    }
    const first = try parse(&bytes, 124, .{ .bmi_offset = 128, .bmi_size = 12, .bits_offset = 140, .bits_size = 8 }, .palette_indices, .{ .bmi_offset = 148, .bmi_size = 12, .bits_offset = 160, .bits_size = 8 }, .palette_indices);
    try std.testing.expect(first.source.start < first.mask.start);
    try std.testing.expectEqual(@as(usize, 0), first.alignment_padding.len);
    const reversed = try parse(&bytes, 124, .{ .bmi_offset = 148, .bmi_size = 12, .bits_offset = 160, .bits_size = 8 }, .palette_indices, .{ .bmi_offset = 128, .bmi_size = 12, .bits_offset = 140, .bits_size = 8 }, .palette_indices);
    try std.testing.expect(reversed.mask.start < reversed.source.start);
    var overlap = bytes;
    std.mem.writeInt(u16, overlap[134..136], 7, .little);
    try std.testing.expectError(error.OverlappingEmfBitmapPair, parse(&overlap, 124, .{ .bmi_offset = 128, .bmi_size = 12, .bits_offset = 140, .bits_size = 28 }, .palette_indices, .{ .bmi_offset = 148, .bmi_size = 12, .bits_offset = 160, .bits_size = 8 }, .palette_indices));
}
