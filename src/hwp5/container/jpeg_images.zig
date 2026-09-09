const std = @import("std");
const structure = @import("../../image/jpeg/structure.zig");
const render = @import("../../image/jpeg/jfif_render.zig");
const sequential = @import("../../image/jpeg/jfif_rgb.zig");
const progressive = @import("../../image/jpeg/jfif_progressive_rgb.zig");
const sequential_frame = @import("../../image/jpeg/sequential_frame.zig");
const progressive_frame = @import("../../image/jpeg/progressive_frame.zig");
const samples = @import("../../image/jpeg/sample_planes.zig");

pub const Options = struct {
    structure: structure.Options = .{},
    render: render.Options,
    completion: progressive_frame.Completion,
    max_samples: usize = (samples.Options{}).max_samples,
    max_sequential_blocks: usize = (sequential_frame.Options{}).max_blocks,
    progressive_storage: @import("../../image/jpeg/coefficient_storage.zig").Options = .{},
    max_progressive_block_visits: usize = (progressive_frame.Options{ .completion = .require_full }).max_block_visits,
};

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

const Process = struct {
    code: u8 = 0,
    fn accept(self: *Process, marker: @import("../../image/jpeg/markers.zig").Marker) !void {
        if (structure.isFrame(marker.code)) self.code = marker.code;
    }
};

fn evidence(image: render.Image, scans: usize) Report {
    return .{
        .images = 1,
        .rgb_bytes = image.raster.rgb.len,
        .profile_images = @intFromBool(image.icc_chunks != 0),
        .metadata_deferred_images = @intFromBool(image.metadata_deferred),
        .scans = scans,
        .adobe_headers = image.adobe_headers,
        .unchecked_compressed_thumbnails = image.unchecked_compressed_thumbnails,
        .unknown_extensions = image.unknown_extensions,
    };
}

/// Dispatch from the validated SOF, never by catching a failed decoder and
/// trying another. Every branch shares the same explicit structural policy.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options, remaining_rgb_bytes: usize) !Report {
    var process: Process = .{};
    const boundaries = try structure.inspectWithContext(bytes, options.structure, &process, Process.accept);
    const selected = try @import("../../image/jpeg/process.zig").fromMarker(process.code);
    if (selected.coding != .huffman or selected.mode == .lossless) return error.UnsupportedHwpJpegProcess;
    var rendering = options.render;
    rendering.max_rgb_bytes = @min(rendering.max_rgb_bytes, remaining_rgb_bytes);
    if (selected.mode == .progressive) {
        var result = try progressive.decode(a, bytes, .{
            .samples = .{ .frame = .{ .completion = options.completion, .structure = options.structure, .storage = options.progressive_storage, .max_block_visits = options.max_progressive_block_visits }, .max_samples = options.max_samples },
            .render = rendering,
        });
        defer result.deinit(a);
        var report = evidence(result.image, boundaries.scans);
        report.progressive_images = 1;
        report.unseen_coefficients = result.progression.unseen_coefficients;
        report.partial_coefficients = result.progression.partial_coefficients;
        report.full_coefficients = result.progression.full_coefficients;
        return report;
    }
    var result = try sequential.decode(a, bytes, .{
        .planes = .{ .frame = .{ .structure = options.structure, .max_blocks = options.max_sequential_blocks }, .max_samples = options.max_samples },
        .upsampling = rendering.upsampling,
        .colour_management = rendering.colour_management,
        .max_rgb_bytes = rendering.max_rgb_bytes,
        .max_adobe_markers = rendering.max_adobe_markers,
        .max_icc_bytes = rendering.max_icc_bytes,
    });
    defer result.deinit(a);
    return evidence(result, boundaries.scans);
}
