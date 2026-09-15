const std = @import("std");
const dib_colors = @import("dib_colors.zig");
const bitmap_object = @import("bitmap_object.zig");

pub const Fields = bitmap_object.Fields;
pub const Source = struct {
    before_bmi: []const u8,
    bmi: []const u8,
    between_bmi_and_bits: []const u8,
    bits: []const u8,
    alignment_padding: []const u8,
    dib: @import("dib_payload.zig").Payload,
    semantic_end: usize,
};

pub fn parse(bytes: []const u8, fixed_end: usize, fields: Fields, usage: dib_colors.Usage) !?Source {
    return parseWithOptions(bytes, fixed_end, fields, usage, .{});
}

pub fn parseWithOptions(bytes: []const u8, fixed_end: usize, fields: Fields, usage: dib_colors.Usage, options: bitmap_object.Options) !?Source {
    const object = bitmap_object.parse(bytes, fixed_end, fields, usage, options) catch |err| switch (err) {
        error.InvalidEmfBitmapObjectExtent => return error.InvalidEmfBitmapSourceExtent,
        error.IncompleteEmfBitmapObject => return error.IncompleteEmfBitmapSource,
        else => return err,
    } orelse return null;
    const semantic_end = std.mem.alignForward(usize, object.data_end, 4);
    if (semantic_end > bytes.len) return error.InvalidEmfBitmapSourcePadding;
    return .{
        .before_bmi = bytes[fixed_end..object.start],
        .bmi = object.bmi,
        .between_bmi_and_bits = object.between_bmi_and_bits,
        .bits = object.bits,
        .alignment_padding = bytes[object.data_end..semantic_end],
        .dib = object.dib,
        .semantic_end = semantic_end,
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
    var unaligned = [_]u8{0} ** 151;
    std.mem.writeInt(u32, unaligned[104..108], 40, .little);
    std.mem.writeInt(i32, unaligned[108..112], 2, .little);
    std.mem.writeInt(i32, unaligned[112..116], 2, .little);
    std.mem.writeInt(u16, unaligned[116..118], 1, .little);
    std.mem.writeInt(u16, unaligned[118..120], 8, .little);
    std.mem.writeInt(u32, unaligned[120..124], 12, .little);
    std.mem.writeInt(u32, unaligned[124..128], 7, .little);
    try std.testing.expectError(error.InvalidEmfBitmapSourcePadding, parse(&unaligned, 100, .{ .bmi_offset = 104, .bmi_size = 40, .bits_offset = 144, .bits_size = 7 }, .palette_indices));
}
