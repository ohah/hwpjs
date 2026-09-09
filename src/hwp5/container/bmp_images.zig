const std = @import("std");
const pixels = @import("../../image/bmp/pixels.zig");
pub const Options = pixels.Options;

/// Additive scalar evidence only; no retained BinData, palette or RGBA views.
pub const Report = struct {
    images: usize = 0,
    rgba_bytes: usize = 0,
    extension_disagreements: usize = 0,
    metadata_deferred_images: usize = 0,
    rle_images: usize = 0,
    rle_written_pixels: usize = 0,
    rle_unwritten_pixels: usize = 0,
    rle_commands: usize = 0,
    rle_consumed_bytes: usize = 0,
    rle_trailing_bytes: usize = 0,
    rle_palette_zero_pixels: usize = 0,
    rle_transparent_pixels: usize = 0,

    pub fn plus(self: Report, other: Report) !Report {
        var result: Report = .{};
        inline for (std.meta.fields(Report)) |field| {
            @field(result, field.name) = std.math.add(usize, @field(self, field.name), @field(other, field.name)) catch return error.LimitExceeded;
        }
        return result;
    }
};

pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options, remaining_rgba_bytes: usize) !Report {
    var selected = options;
    selected.max_rgba_bytes = @min(selected.max_rgba_bytes, remaining_rgba_bytes);
    var image = try pixels.decode(a, bytes, selected);
    defer image.deinit(a);
    var report: Report = .{ .images = 1, .rgba_bytes = image.rgba.len, .metadata_deferred_images = @intFromBool(image.metadata_deferred) };
    if (image.rle) |evidence| {
        report.rle_images = 1;
        report.rle_written_pixels = evidence.written_pixels;
        report.rle_unwritten_pixels = evidence.unwritten_pixels;
        report.rle_commands = evidence.commands;
        report.rle_consumed_bytes = evidence.consumed_bytes;
        report.rle_trailing_bytes = evidence.trailing_bytes;
        report.rle_palette_zero_pixels = if (evidence.unwritten == .palette_zero) evidence.unwritten_pixels else 0;
        report.rle_transparent_pixels = if (evidence.unwritten == .transparent) evidence.unwritten_pixels else 0;
    }
    return report;
}
