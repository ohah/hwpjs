const std = @import("std");
const structure = @import("structure.zig");
const markers = @import("markers.zig");
const frame = @import("frame.zig");
const jfif = @import("jfif.zig");
const render = @import("jfif_render.zig");
const raster = @import("rgb_raster.zig");
const adobe = @import("adobe_inspection.zig");
const icc = @import("icc_extraction.zig");
const sequential = @import("sample_planes.zig");
const progressive = @import("progressive_samples.zig");
const progressive_frame = @import("progressive_frame.zig");
const process = @import("process.zig");
const exif_tiff = @import("exif_tiff.zig");

pub fn isExifMarker(marker: markers.Marker) bool {
    return marker.code == 0xe1 and std.mem.startsWith(u8, marker.payload, "Exif\x00\x00");
}

pub const Options = struct {
    structure: structure.Options = .{},
    render: render.Options,
    completion: progressive_frame.Completion,
    max_samples: usize = (sequential.Options{}).max_samples,
    max_sequential_blocks: usize = (@import("sequential_frame.zig").Options{}).max_blocks,
    progressive_storage: @import("coefficient_storage.zig").Options = .{},
    max_progressive_block_visits: usize = (progressive_frame.Options{ .completion = .require_full }).max_block_visits,
    inspect_exif_orientation: bool = false,
    exif_tiff: exif_tiff.Options = .{},
};

pub const Image = struct {
    raster: raster.Raster,
    adobe_headers: usize,
    icc_chunks: u8,
    observed_zero_based_component_ids: bool,
    progression: ?@import("progressive.zig").Report = null,
    exif_orientation: ?u8 = null,
    exif_orientation_inspected: bool = false,
    exif_nested_ifds_deferred: bool = false,
    /// The APP1 TIFF/Exif tree, orientation transform, colour profile and
    /// Adobe flags are not interpreted as a display-ready image contract.
    metadata_deferred: bool = true,

    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        self.raster.deinit(a);
        self.* = undefined;
    }
};

const Layout = struct {
    report: structure.Report,
    components: usize,
    observed_zero_based_component_ids: bool,
    frame_code: u8,
    exif_payload: []const u8,
};

const State = struct {
    component_ids: jfif.ComponentIds,
    first_after_soi: bool = true,
    components: usize = 0,
    observed_zero_based_component_ids: bool = false,
    frame_code: u8 = 0,
    exif_payload: []const u8 = &.{},

    fn accept(self: *State, marker: markers.Marker) !void {
        if (marker.code == 0xd8) return;
        const exif = isExifMarker(marker);
        if (self.first_after_soi) {
            self.first_after_soi = false;
            if (!exif) return error.MissingExifHeader;
            self.exif_payload = marker.payload;
        } else if (exif) return error.DuplicateExifHeader;
        if (structure.isFrame(marker.code)) {
            const parsed = try frame.parse(marker.code, marker.payload, .{ .max_pixels = std.math.maxInt(u64) });
            self.frame_code = marker.code;
            self.components = parsed.components.count();
            self.observed_zero_based_component_ids = jfif.classifyFrame(parsed, self.component_ids) catch |err| switch (err) {
                error.InvalidJfifComponentCount => return error.UnsupportedExifComponentCount,
                error.InvalidJfifPrecision => return error.UnsupportedExifPrecision,
                error.InvalidJfifComponentId => return error.UnsupportedExifComponentIds,
            };
        }
    }
};

fn inspectLayout(bytes: []const u8, options: Options) !Layout {
    var state: State = .{ .component_ids = options.render.component_ids };
    const report = try structure.inspectWithContext(bytes, options.structure, &state, State.accept);
    if (state.components == 0) return error.MissingJpegFrame;
    return .{ .report = report, .components = state.components, .observed_zero_based_component_ids = state.observed_zero_based_component_ids, .frame_code = state.frame_code, .exif_payload = state.exif_payload };
}

/// Only an Exif-first JPEG with an explicit compatible Adobe APP14 declaration
/// can enter this unmanaged grayscale/YCbCr path. IFD0 orientation is read
/// only when explicitly requested; no Exif transform is applied.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    const layout = try inspectLayout(bytes, options);
    const selected = try process.fromMarker(layout.frame_code);
    if (selected.coding != .huffman or selected.mode == .lossless) return error.UnsupportedJpegProcess;
    _ = try raster.requiredBytes(layout.report.width, layout.report.effective_height, options.render.max_rgb_bytes);
    const metadata: ?exif_tiff.Report = if (options.inspect_exif_orientation) try exif_tiff.inspect(layout.exif_payload, options.exif_tiff) else null;
    var headers = try adobe.inspect(a, bytes, .{ .structure = options.structure, .max_adobe_markers = options.render.max_adobe_markers });
    defer headers.deinit(a);
    if (headers.headers.len == 0) return error.MissingAdobeColourDeclaration;
    for (headers.headers) |header| {
        if (!header.hasPrintIdentifier()) return error.InvalidPrintAdobeIdentifier;
        if ((layout.components == 1 and header.transform != .untransformed) or
            (layout.components == 3 and header.transform != .ycbcr)) return error.UnsupportedExifAdobeColour;
    }
    var profile = try icc.extract(a, bytes, .{ .structure = options.structure, .max_profile_bytes = options.render.max_icc_bytes });
    defer profile.deinit(a);
    const conversion: raster.Options = .{
        .encoding = if (layout.components == 1) .gray else .ycbcr,
        .upsampling = options.render.upsampling,
        .max_rgb_bytes = options.render.max_rgb_bytes,
    };
    if (selected.mode == .progressive) {
        var samples = try progressive.decode(a, bytes, .{ .frame = .{ .completion = options.completion, .structure = options.structure, .storage = options.progressive_storage, .max_block_visits = options.max_progressive_block_visits }, .max_samples = options.max_samples });
        defer samples.deinit(a);
        return .{
            .raster = try raster.fromPlanes(a, samples.image, conversion),
            .adobe_headers = headers.headers.len,
            .icc_chunks = profile.chunk_count,
            .observed_zero_based_component_ids = layout.observed_zero_based_component_ids,
            .progression = samples.progression,
            .exif_orientation = if (metadata) |checked| checked.orientation else null,
            .exif_orientation_inspected = metadata != null,
            .exif_nested_ifds_deferred = if (metadata) |checked| checked.nested_ifds_deferred else false,
        };
    }
    var samples = try sequential.decode(a, bytes, .{ .frame = .{ .structure = options.structure, .max_blocks = options.max_sequential_blocks }, .max_samples = options.max_samples });
    defer samples.deinit(a);
    return .{
        .raster = try raster.fromPlanes(a, samples, conversion),
        .adobe_headers = headers.headers.len,
        .icc_chunks = profile.chunk_count,
        .observed_zero_based_component_ids = layout.observed_zero_based_component_ids,
        .exif_orientation = if (metadata) |checked| checked.orientation else null,
        .exif_orientation_inspected = metadata != null,
        .exif_nested_ifds_deferred = if (metadata) |checked| checked.nested_ifds_deferred else false,
    };
}
