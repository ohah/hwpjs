const std = @import("std");
const layout = @import("jfif_layout.zig");
const structure = @import("structure.zig");
const samples = @import("sample_image.zig");
const raster = @import("rgb_raster.zig");
const adobe = @import("adobe_inspection.zig");
const compatibility = @import("jfif_adobe.zig");
const icc = @import("icc_extraction.zig");
const upsampling = @import("upsampling.zig");

pub const default_rgb_bytes = 192000000;
pub const default_adobe_markers = 256;
pub const default_icc_bytes = 16707345;
pub const ColourManagement = enum { unmanaged };
pub const Options = struct {
    upsampling: upsampling.Method,
    colour_management: ColourManagement,
    max_rgb_bytes: usize = default_rgb_bytes,
    max_adobe_markers: usize = default_adobe_markers,
    max_icc_bytes: usize = default_icc_bytes,
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

/// Owns Adobe descriptors and borrows immutable JPEG metadata until deinit.
/// The sample decoder remains responsible for entropy and coefficient history.
pub const Prepared = struct {
    jfif: layout.Report,
    headers: adobe.Report,
    icc_chunks: u8,
    options: Options,

    pub fn init(a: std.mem.Allocator, bytes: []const u8, boundaries: structure.Options, options: Options) !Prepared {
        const jfif = try layout.inspect(bytes, boundaries);
        _ = try raster.requiredBytes(jfif.structure.width, jfif.structure.effective_height, options.max_rgb_bytes);
        var headers = try adobe.inspect(a, bytes, .{ .structure = boundaries, .max_adobe_markers = options.max_adobe_markers });
        errdefer headers.deinit(a);
        var profile = try icc.extract(a, bytes, .{ .structure = boundaries, .max_profile_bytes = options.max_icc_bytes });
        defer profile.deinit(a);
        return .{ .jfif = jfif, .headers = headers, .icc_chunks = profile.chunk_count, .options = options };
    }

    pub fn render(self: *const Prepared, a: std.mem.Allocator, image: samples.Image) !Image {
        for (self.headers.headers) |header| try compatibility.validate(header, image.planes.len);
        return .{
            .raster = try raster.fromPlanes(a, image, .{ .encoding = if (image.planes.len == 1) .gray else .ycbcr, .upsampling = self.options.upsampling, .max_rgb_bytes = self.options.max_rgb_bytes }),
            .jfif_version = self.jfif.header.version,
            .adobe_headers = self.headers.headers.len,
            .icc_chunks = self.icc_chunks,
            .application_markers = self.jfif.application_markers,
            .unchecked_compressed_thumbnails = self.jfif.compressed_thumbnails_unchecked,
            .unknown_extensions = self.jfif.unknown_extensions,
        };
    }

    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.headers.deinit(a);
        self.* = undefined;
    }
};
