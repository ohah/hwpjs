const std = @import("std");
const bitmap_source = @import("bitmap_source.zig");
const color_ref = @import("../wmf/color_ref.zig");
const dib_colors = @import("dib_colors.zig");
const geometry = @import("geometry.zig");
const ternary = @import("ternary_raster_operation.zig");
const xform = @import("xform.zig");

pub const byte_size = 100;
pub const Core = struct {
    bounds: geometry.RectL,
    destination: geometry.PointL,
    destination_size: geometry.SizeL,
    raster_operation: ternary.Operation,
    source: geometry.PointL,
    source_transform: xform.XForm,
    source_background: color_ref.ColorRef,
    source_usage: dib_colors.Usage,
    bitmap: ?bitmap_source.Source,

    pub fn semanticEnd(self: Core, fixed_end: usize) usize {
        return if (self.bitmap) |value| value.semantic_end else fixed_end;
    }
};

pub fn parse(bytes: []const u8, fixed_end: usize) !Core {
    if (fixed_end < byte_size or fixed_end > bytes.len) return error.InvalidEmfBitBltCoreExtent;
    const operation = try ternary.parse(std.mem.readInt(u32, bytes[40..44], .little));
    const usage = try dib_colors.parse(std.mem.readInt(u32, bytes[80..84], .little));
    const bitmap = try bitmap_source.parse(bytes, fixed_end, .{
        .bmi_offset = std.mem.readInt(u32, bytes[84..88], .little),
        .bmi_size = std.mem.readInt(u32, bytes[88..92], .little),
        .bits_offset = std.mem.readInt(u32, bytes[92..96], .little),
        .bits_size = std.mem.readInt(u32, bytes[96..100], .little),
    }, usage);
    if (operation.requiresSource() and bitmap == null) return error.MissingEmfBltSourceBitmap;
    return .{
        .bounds = try geometry.parseRectL(bytes[8..24]),
        .destination = try geometry.parsePointL(bytes[24..32]),
        .destination_size = try geometry.parseSizeL(bytes[32..40]),
        .raster_operation = operation,
        .source = try geometry.parsePointL(bytes[44..52]),
        .source_transform = try xform.parse(bytes[52..76]),
        .source_background = try color_ref.parse(bytes[76..80], .specified_zero),
        .source_usage = usage,
        .bitmap = bitmap,
    };
}

test "bit blt core uses each consumer's fixed end for source layout" {
    var bytes = [_]u8{0} ** 108;
    std.mem.writeInt(u32, bytes[40..44], 0x00f00021, .little);
    const bit = try parse(&bytes, 100);
    const stretch = try parse(&bytes, 108);
    try std.testing.expectEqual(@as(usize, 100), bit.semanticEnd(100));
    try std.testing.expectEqual(@as(usize, 108), stretch.semanticEnd(108));
    try std.testing.expectError(error.InvalidEmfBitBltCoreExtent, parse(bytes[0..99], 99));
    try std.testing.expectError(error.InvalidEmfBitBltCoreExtent, parse(&bytes, 109));
}
