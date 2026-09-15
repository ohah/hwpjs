const std = @import("std");
const bitmap_source = @import("bitmap_source.zig");
const color_ref = @import("../wmf/color_ref.zig");
const dib_colors = @import("dib_colors.zig");
const geometry = @import("geometry.zig");
const xform = @import("xform.zig");

pub const byte_size = 108;
pub const Core = struct {
    bounds: geometry.RectL,
    destination: geometry.PointL,
    destination_size: geometry.SizeL,
    operation_bytes: [4]u8,
    source: geometry.PointL,
    source_transform: xform.XForm,
    source_background: color_ref.ColorRef,
    source_usage: dib_colors.Usage,
    source_size: geometry.SizeL,
    bitmap: bitmap_source.Source,

    pub fn semanticEnd(self: Core) usize {
        return self.bitmap.semantic_end;
    }
};

pub fn parse(bytes: []const u8, fixed_end: usize) !Core {
    if (fixed_end < byte_size or fixed_end > bytes.len) return error.InvalidEmfBitmapSourceTransferExtent;
    const usage = try dib_colors.parse(std.mem.readInt(u32, bytes[80..84], .little));
    const bitmap = (try bitmap_source.parse(bytes, fixed_end, .{
        .bmi_offset = std.mem.readInt(u32, bytes[84..88], .little),
        .bmi_size = std.mem.readInt(u32, bytes[88..92], .little),
        .bits_offset = std.mem.readInt(u32, bytes[92..96], .little),
        .bits_size = std.mem.readInt(u32, bytes[96..100], .little),
    }, usage)) orelse return error.MissingEmfBitmapSourceTransferBitmap;
    return .{
        .bounds = try geometry.parseRectL(bytes[8..24]),
        .destination = try geometry.parsePointL(bytes[24..32]),
        .destination_size = try geometry.parseSizeL(bytes[32..40]),
        .operation_bytes = bytes[40..44].*,
        .source = try geometry.parsePointL(bytes[44..52]),
        .source_transform = try xform.parse(bytes[52..76]),
        .source_background = try color_ref.parse(bytes[76..80], .specified_zero),
        .source_usage = usage,
        .source_size = try geometry.parseSizeL(bytes[100..108]),
        .bitmap = bitmap,
    };
}

test "bitmap source transfer rejects invalid extent before field access" {
    const bytes = [_]u8{0} ** byte_size;
    try std.testing.expectError(error.InvalidEmfBitmapSourceTransferExtent, parse(bytes[0 .. byte_size - 1], byte_size - 1));
    try std.testing.expectError(error.InvalidEmfBitmapSourceTransferExtent, parse(&bytes, byte_size + 1));
}
