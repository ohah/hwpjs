const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const png = @import("../image/png/pixels.zig");
const jpeg = @import("../image/jpeg/structure.zig");
const jpeg_pixels = @import("../image/jpeg/pixel_inspection.zig");
const jpeg_render = @import("../image/jpeg/jfif_render.zig");
const jpeg_exif = @import("../image/jpeg/exif_tiff.zig");
const bmp = @import("../image/bmp/structure.zig");
const bmp_pixels = @import("../image/bmp/pixels.zig");
const bmp_masks = @import("../image/bmp/masks.zig");
const bmp_rle = @import("../image/bmp/rle_rgba.zig");
const gif = @import("../image/gif/document.zig");
const wmf_header = @import("../image/wmf/header.zig");
const wmf_records = @import("../image/wmf/records.zig");
const tiff = @import("../image/tiff/structure.zig");
const pcx = @import("../image/pcx/structure.zig");
const svg = @import("../image/svg/structure.zig");

pub const Format = enum { png, jpeg, bmp, gif, wmf, tiff, pcx, svg, unknown };
pub const Inspection = enum { png_scanlines, jpeg_framing, jpeg_rgb, bmp_structure, bmp_rgba, gif_indices, wmf_framing, tiff_structure, pcx_rle, svg_xml_structure, unsupported };

/// JPEG marker policy stays in Options.jpeg. Pixel policy cannot override it.
pub const JpegPixelOptions = struct {
    render: jpeg_render.Options = .{ .upsampling = .nearest, .colour_management = .unmanaged },
    max_samples: usize = (@import("../image/jpeg/sample_planes.zig").Options{}).max_samples,
    max_sequential_blocks: usize = (@import("../image/jpeg/sequential_frame.zig").Options{}).max_blocks,
    progressive_storage: @import("../image/jpeg/coefficient_storage.zig").Options = .{},
    max_progressive_block_visits: usize = (@import("../image/jpeg/progressive_frame.zig").Options{ .completion = .require_full }).max_block_visits,
    /// Exif-first pixels require a compatible Adobe APP14 colour declaration.
    exif_adobe_colour: bool = false,
};

/// BMP structure policy stays in Options.bmp. Pixel choices cannot silently
/// override it through the generic decoder's nested structure field.
pub const BmpPixelOptions = struct {
    mask_scaling: bmp_masks.Scaling = .nearest_normalized,
    max_rgba_bytes: usize = 256 * 1024 * 1024,
    rle: ?bmp_rle.Options = null,
};

pub const Options = struct {
    max_targets: usize = 100_000,
    max_entry_bytes: usize = 64 * 1024 * 1024,
    max_total_encoded_bytes: usize = 512 * 1024 * 1024,
    max_total_png_decoded_bytes: usize = 256 * 1024 * 1024,
    max_total_jpeg_rgb_bytes: usize = 256 * 1024 * 1024,
    max_total_bmp_rgba_bytes: usize = 256 * 1024 * 1024,
    max_total_gif_indices: usize = 256 * 1024 * 1024,
    max_total_gif_codes: usize = 256 * 1024 * 1024,
    max_total_gif_frames: usize = 10_000,
    max_total_pcx_decoded_bytes: usize = 256 * 1024 * 1024,
    png: png.Options = .{},
    jpeg: jpeg.Options = .{},
    jpeg_pixels: ?JpegPixelOptions = null,
    /// Independent of RGB decoding; reads only first-APP1 IFD0 orientation.
    jpeg_exif_orientation: ?jpeg_exif.Options = null,
    bmp: bmp.Options = .{},
    bmp_pixels: ?BmpPixelOptions = .{},
    gif: gif.Options = .{},
    tiff: tiff.Options = .{},
    pcx: pcx.Options = .{},
    svg: svg.Options = .{},
};

pub const Target = struct {
    item_index: usize,
    entry_index: usize,
    first_site_index: usize,
    references: usize,
    encoded_bytes: usize,
    format: Format,
    inspection: Inspection,
    inspection_error: ?anyerror,
    /// null means the byte format is not recognized, so MIME cannot be judged.
    media_matches: ?bool,
    /// True only after successful RGB decode using the explicit non-JFIF ID profile.
    observed_zero_based_jpeg_component_ids: bool = false,
    /// Colour was selected from Adobe APP14 in an Exif-first JPEG, not JFIF.
    jpeg_exif_adobe_colour: bool = false,
    jpeg_exif_orientation_inspected: bool = false,
    jpeg_exif_orientation: ?u8 = null,
    jpeg_exif_nested_ifds_deferred: bool = false,
    jpeg_exif_orientation_error: ?anyerror = null,
};

pub const Report = struct {
    sites: usize,
    non_embedded_sites: usize,
    targets: []Target,
    media_mismatches: usize,
    unknown_formats: usize,
    inspection_failures: usize,
    jpeg_exif_orientation_failures: usize,
    encoded_bytes: usize,
    png_decoded_bytes: usize,
    jpeg_rgb_bytes: usize,
    bmp_rgba_bytes: usize,
    gif_indices: usize,
    gif_codes: usize,
    gif_frames: usize,
    pcx_decoded_bytes: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.targets);
        self.* = undefined;
    }
};

pub fn formatOf(bytes: []const u8) Format {
    if (std.mem.startsWith(u8, bytes, @import("../image/png/chunks.zig").signature)) return .png;
    if (std.mem.startsWith(u8, bytes, &.{ 0xff, 0xd8 })) return .jpeg;
    if (std.mem.startsWith(u8, bytes, "BM")) return .bmp;
    if (std.mem.startsWith(u8, bytes, "GIF")) return .gif;
    if (wmf_header.looksLike(bytes)) return .wmf;
    if (std.mem.startsWith(u8, bytes, &.{ 0x49, 0x49, 0x2a, 0x00 }) or std.mem.startsWith(u8, bytes, &.{ 0x4d, 0x4d, 0x00, 0x2a })) return .tiff;
    if (pcx.looksLike(bytes)) return .pcx;
    if (svg.looksLike(bytes)) return .svg;
    return .unknown;
}

pub fn mediaMatches(format: Format, media: []const u8) ?bool {
    return switch (format) {
        .png => std.ascii.eqlIgnoreCase(media, "image/png"),
        .jpeg => std.ascii.eqlIgnoreCase(media, "image/jpeg") or std.ascii.eqlIgnoreCase(media, "image/jpg"),
        .bmp => std.ascii.eqlIgnoreCase(media, "image/bmp"),
        .gif => std.ascii.eqlIgnoreCase(media, "image/gif"),
        .wmf => std.ascii.eqlIgnoreCase(media, "image/wmf"),
        .tiff => std.ascii.eqlIgnoreCase(media, "image/tiff") or std.ascii.eqlIgnoreCase(media, "image/tif"),
        .pcx => std.ascii.eqlIgnoreCase(media, "image/pcx") or std.ascii.eqlIgnoreCase(media, "image/x-pcx") or std.ascii.eqlIgnoreCase(media, "image/vnd.zbrush.pcx"),
        .svg => std.ascii.eqlIgnoreCase(media, "image/svg+xml"),
        .unknown => null,
    };
}

fn svgCandidate(item: manifest.Item) bool {
    if (std.ascii.eqlIgnoreCase(item.media_type, "image/svg+xml") or std.ascii.eqlIgnoreCase(item.media_type, "image/svg")) return true;
    return item.href.len >= 4 and std.ascii.eqlIgnoreCase(item.href[item.href.len - 4 ..], ".svg");
}

const Evidence = struct { png_decoded_bytes: usize = 0, jpeg_rgb_bytes: usize = 0, observed_zero_based_jpeg_component_ids: bool = false, jpeg_exif_adobe_colour: bool = false, bmp_rgba_bytes: usize = 0, gif_indices: usize = 0, gif_codes: usize = 0, gif_frames: usize = 0, pcx_decoded_bytes: usize = 0 };

fn validate(a: std.mem.Allocator, bytes: []const u8, format: Format, options: Options, consumed: Evidence) !Evidence {
    switch (format) {
        .png => {
            var selected = options.png;
            selected.max_decoded_bytes = @min(selected.max_decoded_bytes, options.max_total_png_decoded_bytes - consumed.png_decoded_bytes);
            const report = try png.inspect(a, bytes, selected);
            return .{ .png_decoded_bytes = report.decoded_bytes };
        },
        .jpeg => {
            if (options.jpeg_pixels) |pixel_options| {
                const selected: jpeg_pixels.Options = .{
                    .structure = options.jpeg,
                    .render = pixel_options.render,
                    .completion = .require_full,
                    .max_samples = pixel_options.max_samples,
                    .max_sequential_blocks = pixel_options.max_sequential_blocks,
                    .progressive_storage = pixel_options.progressive_storage,
                    .max_progressive_block_visits = pixel_options.max_progressive_block_visits,
                    .exif_adobe_colour = pixel_options.exif_adobe_colour,
                };
                const checked = try jpeg_pixels.inspect(a, bytes, selected, options.max_total_jpeg_rgb_bytes -| consumed.jpeg_rgb_bytes);
                return .{ .jpeg_rgb_bytes = checked.rgb_bytes, .observed_zero_based_jpeg_component_ids = checked.observed_zero_based_component_ids, .jpeg_exif_adobe_colour = checked.exif_adobe_colour };
            }
            _ = try jpeg.inspect(bytes, options.jpeg);
            return .{};
        },
        .bmp => {
            if (options.bmp_pixels) |pixel_options| {
                const selected: bmp_pixels.Options = .{
                    .structure = options.bmp,
                    .colour_management = .unmanaged,
                    .mask_scaling = pixel_options.mask_scaling,
                    .max_rgba_bytes = @min(pixel_options.max_rgba_bytes, options.max_total_bmp_rgba_bytes -| consumed.bmp_rgba_bytes),
                    .rle = pixel_options.rle,
                };
                var image = try bmp_pixels.decode(a, bytes, selected);
                defer image.deinit(a);
                return .{ .bmp_rgba_bytes = image.rgba.len };
            }
            _ = try bmp.inspect(bytes, options.bmp);
            return .{};
        },
        .gif => {
            var selected = options.gif;
            selected.max_total_pixels = @min(selected.max_total_pixels, options.max_total_gif_indices - consumed.gif_indices);
            selected.max_total_codes = @min(selected.max_total_codes, options.max_total_gif_codes - consumed.gif_codes);
            selected.max_frames = @min(selected.max_frames, options.max_total_gif_frames - consumed.gif_frames);
            var decoded = try gif.decode(a, bytes, selected);
            defer decoded.deinit(a);
            return .{ .gif_indices = decoded.total_pixels, .gif_codes = decoded.total_codes, .gif_frames = decoded.frames.len };
        },
        .wmf => {
            if (std.mem.startsWith(u8, bytes, &.{ 0xd7, 0xcd, 0xc6, 0x9a })) {
                const header = try wmf_header.parse(bytes, .specified);
                _ = try wmf_records.validate(bytes, header, .{});
            } else {
                const header = try wmf_header.parseStandard(bytes);
                _ = try wmf_records.validate(bytes, header, .{});
            }
            return .{};
        },
        .tiff => {
            _ = try tiff.inspect(bytes, options.tiff);
            return .{};
        },
        .pcx => {
            var selected = options.pcx;
            selected.max_decoded_bytes = @min(selected.max_decoded_bytes, options.max_total_pcx_decoded_bytes -| consumed.pcx_decoded_bytes);
            const report = try pcx.inspect(bytes, selected);
            return .{ .pcx_decoded_bytes = report.decoded_bytes };
        },
        .svg => {
            _ = try svg.inspect(a, bytes, options.svg);
            return .{};
        },
        .unknown => return .{},
    }
}

/// Each embedded manifest item is ZIP-decoded and format-inspected once.
/// Raw sites retain absent/empty/missing/external states in the sibling link
/// report. Unknown bytes remain explicitly uninspected, not valid images.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: manifest.Manifest, sites: anytype, options: Options) !Report {
    const seen = try a.alloc(?usize, items.items.len);
    defer a.free(seen);
    @memset(seen, null);
    var targets: std.ArrayList(Target) = .empty;
    errdefer targets.deinit(a);
    var result: Report = .{ .sites = sites.len, .non_embedded_sites = 0, .targets = undefined, .media_mismatches = 0, .unknown_formats = 0, .inspection_failures = 0, .jpeg_exif_orientation_failures = 0, .encoded_bytes = 0, .png_decoded_bytes = 0, .jpeg_rgb_bytes = 0, .bmp_rgba_bytes = 0, .gif_indices = 0, .gif_codes = 0, .gif_frames = 0, .pcx_decoded_bytes = 0 };
    for (sites, 0..) |site, site_index| {
        if (site.target.state != .embedded) {
            result.non_embedded_sites += 1;
            continue;
        }
        const item_index = site.target.item_index orelse return error.InvalidImageLinkReport;
        if (item_index >= items.items.len) return error.InvalidImageLinkReport;
        if (seen[item_index]) |target_index| {
            targets.items[target_index].references += 1;
            continue;
        }
        if (targets.items.len == options.max_targets) return error.LimitExceeded;
        const item = items.items[item_index];
        const entry_index = item.entry_index orelse return error.InvalidImageLinkReport;
        if (entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const entry = archive.entries[entry_index];
        if (!std.mem.eql(u8, entry.name, item.href)) return error.InvalidManifestEntryIndex;
        if (entry.uncompressed_size > options.max_entry_bytes or entry.uncompressed_size > options.max_total_encoded_bytes -| result.encoded_bytes) return error.LimitExceeded;
        const bytes = try archive.decode(entry, options.max_entry_bytes);
        defer archive.allocator.free(bytes);
        const signature_format = formatOf(bytes);
        const format: Format = if (signature_format == .unknown and svgCandidate(item)) .svg else signature_format;
        var inspection_error: ?anyerror = null;
        const consumed: Evidence = .{ .png_decoded_bytes = result.png_decoded_bytes, .jpeg_rgb_bytes = result.jpeg_rgb_bytes, .bmp_rgba_bytes = result.bmp_rgba_bytes, .gif_indices = result.gif_indices, .gif_codes = result.gif_codes, .gif_frames = result.gif_frames, .pcx_decoded_bytes = result.pcx_decoded_bytes };
        const evidence = validate(a, bytes, format, options, consumed) catch |err| switch (err) {
            error.OutOfMemory, error.LimitExceeded => return err,
            else => blk: {
                inspection_error = err;
                break :blk Evidence{};
            },
        };
        var exif_metadata: ?jpeg_exif.Report = null;
        var exif_error: ?anyerror = null;
        if (format == .jpeg) {
            if (options.jpeg_exif_orientation) |selected| {
                exif_metadata = jpeg_exif.inspectFirst(bytes, options.jpeg.markers, selected) catch |err| switch (err) {
                    error.LimitExceeded => return err,
                    else => blk: {
                        exif_error = err;
                        break :blk null;
                    },
                };
            }
        }
        const matches = mediaMatches(format, item.media_type);
        try targets.append(a, .{
            .item_index = item_index,
            .entry_index = entry_index,
            .first_site_index = site_index,
            .references = 1,
            .encoded_bytes = bytes.len,
            .format = format,
            .observed_zero_based_jpeg_component_ids = evidence.observed_zero_based_jpeg_component_ids,
            .jpeg_exif_adobe_colour = evidence.jpeg_exif_adobe_colour,
            .jpeg_exif_orientation_inspected = exif_metadata != null,
            .jpeg_exif_orientation = if (exif_metadata) |meta| meta.orientation else null,
            .jpeg_exif_nested_ifds_deferred = if (exif_metadata) |meta| meta.nested_ifds_deferred else false,
            .jpeg_exif_orientation_error = exif_error,
            .inspection = switch (format) {
                .png => .png_scanlines,
                .jpeg => if (options.jpeg_pixels != null) .jpeg_rgb else .jpeg_framing,
                .bmp => if (options.bmp_pixels != null) .bmp_rgba else .bmp_structure,
                .gif => .gif_indices,
                .wmf => .wmf_framing,
                .tiff => .tiff_structure,
                .pcx => .pcx_rle,
                .svg => .svg_xml_structure,
                .unknown => .unsupported,
            },
            .inspection_error = inspection_error,
            .media_matches = matches,
        });
        seen[item_index] = targets.items.len - 1;
        result.encoded_bytes += bytes.len;
        result.media_mismatches += @intFromBool(matches == false);
        result.unknown_formats += @intFromBool(format == .unknown);
        result.inspection_failures += @intFromBool(inspection_error != null);
        result.jpeg_exif_orientation_failures += @intFromBool(exif_error != null);
        result.png_decoded_bytes += evidence.png_decoded_bytes;
        result.jpeg_rgb_bytes += evidence.jpeg_rgb_bytes;
        result.bmp_rgba_bytes += evidence.bmp_rgba_bytes;
        result.gif_indices += evidence.gif_indices;
        result.gif_codes += evidence.gif_codes;
        result.gif_frames += evidence.gif_frames;
        result.pcx_decoded_bytes += evidence.pcx_decoded_bytes;
    }
    result.targets = try targets.toOwnedSlice(a);
    return result;
}
