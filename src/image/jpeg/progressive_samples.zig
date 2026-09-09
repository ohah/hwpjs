const std = @import("std");
const frame = @import("progressive_frame.zig");
const storage = @import("sample_image.zig");
const sample_block = @import("sample_block.zig");
const Format = @import("sample_restoration.zig").Format;
const Report = @import("progressive.zig").Report;

pub const Options = struct { frame: frame.Options, max_samples: usize = 64000000 };
pub const Conversion = struct { completion: frame.Completion, max_samples: usize = 64000000 };
pub const Result = struct {
    image: storage.Image,
    progression: Report,
    /// Only the first image.planes.len entries are active.
    levels: [4][64]u8,

    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        self.image.deinit(a);
        self.* = undefined;
    }
};

pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Result {
    var coefficients = try frame.decode(a, bytes, options.frame);
    defer coefficients.deinit(a);
    return fromCoefficients(a, &coefficients, .{ .completion = options.frame.completion, .max_samples = options.max_samples });
}

/// Borrows an unmodified Image returned by progressive_frame.decode. Input is
/// never changed or retained. Partial AC/precision may be reconstructed only
/// when explicitly requested; an entirely unseen component is not synthesized.
pub fn fromCoefficients(a: std.mem.Allocator, input: *const frame.Image, options: Conversion) !Result {
    try input.checkCompletion(options.completion);
    const format = try Format.init(input.precision);
    var descriptors: [4]storage.Descriptor = undefined;
    var levels: [4][64]u8 = @splat(@splat(255));
    for (input.planes, 0..) |plane, i| {
        if (plane.quantization == null) return error.UnseenJpegProgressiveComponent;
        descriptors[i] = .{ .component = plane.component, .extent = plane.visible };
        levels[i] = plane.levels;
    }
    var image = try storage.Image.init(a, input.width, input.height, input.precision, descriptors[0..input.planes.len], options.max_samples);
    errdefer image.deinit(a);
    for (input.planes, image.planes) |*source, *target| {
        const visible = source.visible.blocks();
        for (0..visible.height) |y| for (0..visible.width) |x| {
            const values = source.grid.atConst(@intCast(x), @intCast(y)) orelse return error.InvalidJpegBlockPosition;
            try sample_block.write(target, format, values.*, source.quantization.?.view(), @intCast(x), @intCast(y));
        };
    }
    return .{ .image = image, .progression = input.progression, .levels = levels };
}
