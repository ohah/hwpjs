const std = @import("std");
const pixels = @import("../../image/jpeg/pixel_inspection.zig");

pub const Options = pixels.Options;

/// All fields are additive scalar evidence, never retained pixels/profile views.
pub const Report = struct {
    images: usize = 0,
    progressive_images: usize = 0,
    rgb_bytes: usize = 0,
    extension_disagreements: usize = 0,
    profile_images: usize = 0,
    metadata_deferred_images: usize = 0,
    scans: usize = 0,
    unseen_coefficients: usize = 0,
    partial_coefficients: usize = 0,
    full_coefficients: usize = 0,
    adobe_headers: usize = 0,
    unchecked_compressed_thumbnails: usize = 0,
    unknown_extensions: usize = 0,

    pub fn plus(self: Report, other: Report) !Report {
        var result: Report = .{};
        inline for (std.meta.fields(Report)) |field| {
            @field(result, field.name) = std.math.add(usize, @field(self, field.name), @field(other, field.name)) catch return error.LimitExceeded;
        }
        return result;
    }
};

fn fromEvidence(value: pixels.Evidence) Report {
    return .{
        .images = 1,
        .progressive_images = @intFromBool(value.progressive),
        .rgb_bytes = value.rgb_bytes,
        .profile_images = @intFromBool(value.profile),
        .metadata_deferred_images = @intFromBool(value.metadata_deferred),
        .scans = value.scans,
        .unseen_coefficients = value.unseen_coefficients,
        .partial_coefficients = value.partial_coefficients,
        .full_coefficients = value.full_coefficients,
        .adobe_headers = value.adobe_headers,
        .unchecked_compressed_thumbnails = value.unchecked_compressed_thumbnails,
        .unknown_extensions = value.unknown_extensions,
    };
}

/// HWP retains its historical error name and report shape. JPEG byte parsing
/// and pixel interpretation are owned by the format-level core.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options, remaining_rgb_bytes: usize) !Report {
    const result = pixels.inspect(a, bytes, options, remaining_rgb_bytes) catch |err| switch (err) {
        error.UnsupportedJpegProcess => return error.UnsupportedHwpJpegProcess,
        else => return err,
    };
    return fromEvidence(result);
}
