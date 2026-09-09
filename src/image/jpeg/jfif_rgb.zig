const std = @import("std");
const layout = @import("jfif_layout.zig");
const planes = @import("sample_planes.zig");
const raster = @import("rgb_raster.zig");
const adobe = @import("adobe_inspection.zig");
const compatibility = @import("jfif_adobe.zig");
const icc = @import("icc_extraction.zig");
const upsampling = @import("upsampling.zig");

pub const Options = struct {
    planes: planes.Options = .{},
    upsampling: upsampling.Method,
    /// Mandatory acknowledgement: this is not display-ready sRGB output.
    colour_management: enum { unmanaged },
    max_rgb_bytes: usize = 192000000,
    max_adobe_markers: usize = 256,
    max_icc_bytes: usize = 16707345,
};
pub const Image = struct {
    raster: raster.Raster,
    jfif_version: u16,
    adobe_headers: usize,
    icc_chunks: u8,
    application_markers: usize,
    unchecked_compressed_thumbnails: usize,
    unknown_extensions: usize,
    /// ICC content/CMM, Adobe flags, Exif orientation and other APP semantics.
    metadata_deferred: bool = true,

    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        self.raster.deinit(a);
        self.* = undefined;
    }
};

/// An explicit JFIF interpretation. Unsupported progressive entropy remains
/// an error; no preview/thumbnail substitution or generic JPEG colour guessing.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    const jfif = try layout.inspect(bytes, options.planes.frame.structure);
    _ = try raster.requiredBytes(jfif.structure.width, jfif.structure.effective_height, options.max_rgb_bytes);
    var headers = try adobe.inspect(a, bytes, .{ .structure = options.planes.frame.structure, .max_adobe_markers = options.max_adobe_markers });
    defer headers.deinit(a);
    var profile = try icc.extract(a, bytes, .{ .structure = options.planes.frame.structure, .max_profile_bytes = options.max_icc_bytes });
    defer profile.deinit(a);
    var samples = try planes.decode(a, bytes, options.planes);
    defer samples.deinit(a);
    for (headers.headers) |header| try compatibility.validate(header, samples.planes.len);
    return .{
        .raster = try raster.fromPlanes(a, samples, .{ .encoding = if (samples.planes.len == 1) .gray else .ycbcr, .upsampling = options.upsampling, .max_rgb_bytes = options.max_rgb_bytes }),
        .jfif_version = jfif.header.version,
        .adobe_headers = headers.headers.len,
        .icc_chunks = profile.chunk_count,
        .application_markers = jfif.application_markers,
        .unchecked_compressed_thumbnails = jfif.compressed_thumbnails_unchecked,
        .unknown_extensions = jfif.unknown_extensions,
    };
}
