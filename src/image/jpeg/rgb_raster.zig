const std = @import("std");
const planes = @import("sample_planes.zig");
const upsampling = @import("upsampling.zig");
const colour = @import("jfif_colour.zig");

/// Selected by the caller, never guessed from component IDs or sample values.
pub const Encoding = enum { gray, rgb, ycbcr };
pub const Options = struct {
    encoding: Encoding,
    upsampling: upsampling.Method,
    max_rgb_bytes: usize = 192000000,
};
pub const Raster = struct {
    width: u16,
    height: u16,
    /// Owned top-down, row-major packed RGB; no ICC conversion or orientation.
    rgb: []u8,

    pub fn deinit(self: *Raster, a: std.mem.Allocator) void {
        a.free(self.rgb);
        self.* = undefined;
    }
};

pub fn requiredBytes(width: u16, height: u16, maximum: usize) !usize {
    if (width == 0 or height == 0) return error.InvalidJpegRasterDimensions;
    const size = @as(u64, width) * height * 3;
    if (size > maximum or size > std.math.maxInt(usize)) return error.LimitExceeded;
    return @intCast(size);
}

/// Input planes are borrowed only for this call. This layer validates sample
/// storage, but does not certify any file metadata or infer a colour encoding.
pub fn fromPlanes(a: std.mem.Allocator, input: planes.Image, options: Options) !Raster {
    const size = try requiredBytes(input.width, input.height, options.max_rgb_bytes);
    if (input.precision != 8) return error.UnsupportedJpegRgbPrecision;
    const count: usize = if (options.encoding == .gray) 1 else 3;
    if (input.planes.len != count) return error.InvalidJpegRgbComponentCount;
    var samplers: [3]upsampling.Sampler = undefined;
    for (input.planes, 0..) |plane, i| {
        if (plane.extent.width > input.width or plane.extent.height > input.height) return error.InvalidJpegSampleAxis;
        samplers[i] = try upsampling.Sampler.fromDimensions(plane.samples, @intCast(plane.extent.width), @intCast(plane.extent.height), input.width, input.height, options.upsampling);
        for (plane.samples) |value| if (value > 255) return error.InvalidJpegRgbSample;
    }
    const rgb = try a.alloc(u8, size);
    for (0..input.height) |y| for (0..input.width) |x| {
        var values: [3]u8 = undefined;
        for (samplers[0..count], 0..) |sampler, i| values[i] = @intCast(sampler.sample(@intCast(x), @intCast(y)).?);
        const pixel = switch (options.encoding) {
            .gray => colour.grayscale(values[0]),
            .rgb => values,
            .ycbcr => colour.toRgb(values[0], values[1], values[2]),
        };
        @memcpy(rgb[(y * input.width + x) * 3 ..][0..3], &pixel);
    };
    return .{ .width = input.width, .height = input.height, .rgb = rgb };
}
