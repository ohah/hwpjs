const std = @import("std");
const pixels = @import("../../image/bmp/pixels.zig");
pub const Options = pixels.Options;

/// Additive scalar evidence only; no retained BinData, palette or RGBA views.
pub const Report = struct {
    images: usize = 0,
    rgba_bytes: usize = 0,
    extension_disagreements: usize = 0,
    metadata_deferred_images: usize = 0,

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
    return .{ .images = 1, .rgba_bytes = image.rgba.len, .metadata_deferred_images = @intFromBool(image.metadata_deferred) };
}
