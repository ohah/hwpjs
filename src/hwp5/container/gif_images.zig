const std = @import("std");
const gif = @import("../../image/gif/document.zig");
pub const Options = gif.Options;

/// Scalar evidence only: decoded indices and borrowed metadata never escape.
pub const Report = struct {
    images: usize = 0,
    frames: usize = 0,
    index_bytes: usize = 0,
    codes: usize = 0,
    blocks: usize = 0,
    sub_blocks: usize = 0,
    comments: usize = 0,
    applications: usize = 0,
    plain_texts: usize = 0,
    unresolved_color_frames: usize = 0,
    reserved_disposals: usize = 0,
    trailing_bytes: usize = 0,
    rendering_deferred_images: usize = 0,
    extension_disagreements: usize = 0,

    pub fn plus(self: Report, other: Report) !Report {
        var result: Report = .{};
        inline for (std.meta.fields(Report)) |field| {
            @field(result, field.name) = std.math.add(usize, @field(self, field.name), @field(other, field.name)) catch return error.LimitExceeded;
        }
        return result;
    }
};

pub fn inspect(a: std.mem.Allocator, bytes: []const u8, selected: Options, remaining_indices: usize, remaining_codes: usize, remaining_frames: usize) !Report {
    var options = selected;
    options.max_total_pixels = @min(options.max_total_pixels, remaining_indices);
    options.max_total_codes = @min(options.max_total_codes, remaining_codes);
    options.max_frames = @min(options.max_frames, remaining_frames);
    var decoded = try gif.decode(a, bytes, options);
    defer decoded.deinit(a);
    return .{
        .images = 1,
        .frames = decoded.frames.len,
        .index_bytes = decoded.total_pixels,
        .codes = decoded.total_codes,
        .blocks = decoded.blocks,
        .sub_blocks = decoded.sub_blocks,
        .comments = decoded.comments,
        .applications = decoded.applications,
        .plain_texts = decoded.plain_texts,
        .unresolved_color_frames = decoded.unresolved_color_frames,
        .reserved_disposals = decoded.reserved_disposals,
        .trailing_bytes = decoded.trailing_bytes,
        .rendering_deferred_images = @intFromBool(decoded.rendering_deferred),
    };
}
