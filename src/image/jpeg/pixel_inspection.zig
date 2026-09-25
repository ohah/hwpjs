const std = @import("std");
const structure = @import("structure.zig");
const render = @import("jfif_render.zig");
const sequential = @import("jfif_rgb.zig");
const progressive = @import("jfif_progressive_rgb.zig");
const sequential_frame = @import("sequential_frame.zig");
const progressive_frame = @import("progressive_frame.zig");
const samples = @import("sample_planes.zig");
const exif_adobe = @import("exif_adobe_rgb.zig");

pub const Options = struct {
    structure: structure.Options = .{},
    render: render.Options,
    completion: progressive_frame.Completion,
    max_samples: usize = (samples.Options{}).max_samples,
    max_sequential_blocks: usize = (sequential_frame.Options{}).max_blocks,
    progressive_storage: @import("coefficient_storage.zig").Options = .{},
    max_progressive_block_visits: usize = (progressive_frame.Options{ .completion = .require_full }).max_block_visits,
    exif_adobe_colour: bool = false,
    inspect_exif_orientation: bool = false,
    exif_tiff: @import("exif_tiff.zig").Options = .{},
};

/// Pixel and metadata evidence only. No HWP or HWPX container policy lives here.
pub const Evidence = struct {
    progressive: bool = false,
    rgb_bytes: usize = 0,
    profile: bool = false,
    metadata_deferred: bool = false,
    scans: usize = 0,
    unseen_coefficients: usize = 0,
    partial_coefficients: usize = 0,
    full_coefficients: usize = 0,
    adobe_headers: usize = 0,
    unchecked_compressed_thumbnails: usize = 0,
    unknown_extensions: usize = 0,
    observed_zero_based_component_ids: bool = false,
    exif_adobe_colour: bool = false,
    exif_orientation_inspected: bool = false,
    exif_orientation: ?u8 = null,
    exif_nested_ifds_deferred: bool = false,
};

const Process = struct {
    code: u8 = 0,
    first_after_soi: bool = true,
    exif_first: bool = false,
    fn accept(self: *Process, marker: @import("markers.zig").Marker) !void {
        if (marker.code != 0xd8 and self.first_after_soi) {
            self.first_after_soi = false;
            self.exif_first = exif_adobe.isExifMarker(marker);
        }
        if (structure.isFrame(marker.code)) self.code = marker.code;
    }
};

fn evidence(image: render.Image, scans: usize) Evidence {
    return .{
        .rgb_bytes = image.raster.rgb.len,
        .profile = image.icc_chunks != 0,
        .metadata_deferred = image.metadata_deferred,
        .scans = scans,
        .adobe_headers = image.adobe_headers,
        .unchecked_compressed_thumbnails = image.unchecked_compressed_thumbnails,
        .unknown_extensions = image.unknown_extensions,
        .observed_zero_based_component_ids = image.observed_zero_based_component_ids,
    };
}

/// Dispatch by the validated SOF. A failed decoder never falls back to a
/// thumbnail, another process, or structural success.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options, remaining_rgb_bytes: usize) !Evidence {
    var process: Process = .{};
    const boundaries = try structure.inspectWithContext(bytes, options.structure, &process, Process.accept);
    const selected = try @import("process.zig").fromMarker(process.code);
    if (selected.coding != .huffman or selected.mode == .lossless) return error.UnsupportedJpegProcess;
    var rendering = options.render;
    rendering.max_rgb_bytes = @min(rendering.max_rgb_bytes, remaining_rgb_bytes);
    if (options.exif_adobe_colour and process.exif_first) {
        var image = try exif_adobe.decode(a, bytes, .{
            .structure = options.structure,
            .render = rendering,
            .completion = options.completion,
            .max_samples = options.max_samples,
            .max_sequential_blocks = options.max_sequential_blocks,
            .progressive_storage = options.progressive_storage,
            .max_progressive_block_visits = options.max_progressive_block_visits,
            .inspect_exif_orientation = options.inspect_exif_orientation,
            .exif_tiff = options.exif_tiff,
        });
        defer image.deinit(a);
        var report: Evidence = .{
            .progressive = selected.mode == .progressive,
            .rgb_bytes = image.raster.rgb.len,
            .profile = image.icc_chunks != 0,
            .metadata_deferred = image.metadata_deferred,
            .scans = boundaries.scans,
            .adobe_headers = image.adobe_headers,
            .observed_zero_based_component_ids = image.observed_zero_based_component_ids,
            .exif_adobe_colour = true,
            .exif_orientation_inspected = image.exif_orientation_inspected,
            .exif_orientation = image.exif_orientation,
            .exif_nested_ifds_deferred = image.exif_nested_ifds_deferred,
        };
        if (image.progression) |progression| {
            report.unseen_coefficients = progression.unseen_coefficients;
            report.partial_coefficients = progression.partial_coefficients;
            report.full_coefficients = progression.full_coefficients;
        }
        return report;
    }
    if (selected.mode == .progressive) {
        var result = try progressive.decode(a, bytes, .{
            .samples = .{ .frame = .{ .completion = options.completion, .structure = options.structure, .storage = options.progressive_storage, .max_block_visits = options.max_progressive_block_visits }, .max_samples = options.max_samples },
            .render = rendering,
        });
        defer result.deinit(a);
        var report = evidence(result.image, boundaries.scans);
        report.progressive = true;
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
        .component_ids = rendering.component_ids,
    });
    defer result.deinit(a);
    return evidence(result, boundaries.scans);
}
