const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const png = @import("../image/png/pixels.zig");
const jpeg = @import("../image/jpeg/structure.zig");
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
pub const Inspection = enum { png_scanlines, jpeg_framing, bmp_structure, bmp_rgba, gif_indices, wmf_framing, tiff_structure, pcx_rle, svg_xml_structure, unsupported };

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
    max_total_bmp_rgba_bytes: usize = 256 * 1024 * 1024,
    max_total_gif_indices: usize = 256 * 1024 * 1024,
    max_total_gif_codes: usize = 256 * 1024 * 1024,
    max_total_gif_frames: usize = 10_000,
    max_total_pcx_decoded_bytes: usize = 256 * 1024 * 1024,
    png: png.Options = .{},
    jpeg: jpeg.Options = .{},
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
};

pub const Report = struct {
    sites: usize,
    non_embedded_sites: usize,
    targets: []Target,
    media_mismatches: usize,
    unknown_formats: usize,
    inspection_failures: usize,
    encoded_bytes: usize,
    png_decoded_bytes: usize,
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

const Evidence = struct { png_decoded_bytes: usize = 0, bmp_rgba_bytes: usize = 0, gif_indices: usize = 0, gif_codes: usize = 0, gif_frames: usize = 0, pcx_decoded_bytes: usize = 0 };

fn validate(a: std.mem.Allocator, bytes: []const u8, format: Format, options: Options, consumed: Evidence) !Evidence {
    switch (format) {
        .png => {
            var selected = options.png;
            selected.max_decoded_bytes = @min(selected.max_decoded_bytes, options.max_total_png_decoded_bytes - consumed.png_decoded_bytes);
            const report = try png.inspect(a, bytes, selected);
            return .{ .png_decoded_bytes = report.decoded_bytes };
        },
        .jpeg => {
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
    var result: Report = .{ .sites = sites.len, .non_embedded_sites = 0, .targets = undefined, .media_mismatches = 0, .unknown_formats = 0, .inspection_failures = 0, .encoded_bytes = 0, .png_decoded_bytes = 0, .bmp_rgba_bytes = 0, .gif_indices = 0, .gif_codes = 0, .gif_frames = 0, .pcx_decoded_bytes = 0 };
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
        const consumed: Evidence = .{ .png_decoded_bytes = result.png_decoded_bytes, .bmp_rgba_bytes = result.bmp_rgba_bytes, .gif_indices = result.gif_indices, .gif_codes = result.gif_codes, .gif_frames = result.gif_frames, .pcx_decoded_bytes = result.pcx_decoded_bytes };
        const evidence = validate(a, bytes, format, options, consumed) catch |err| switch (err) {
            error.OutOfMemory, error.LimitExceeded => return err,
            else => blk: {
                inspection_error = err;
                break :blk Evidence{};
            },
        };
        const matches = mediaMatches(format, item.media_type);
        try targets.append(a, .{
            .item_index = item_index,
            .entry_index = entry_index,
            .first_site_index = site_index,
            .references = 1,
            .encoded_bytes = bytes.len,
            .format = format,
            .inspection = switch (format) {
                .png => .png_scanlines,
                .jpeg => .jpeg_framing,
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
        result.png_decoded_bytes += evidence.png_decoded_bytes;
        result.bmp_rgba_bytes += evidence.bmp_rgba_bytes;
        result.gif_indices += evidence.gif_indices;
        result.gif_codes += evidence.gif_codes;
        result.gif_frames += evidence.gif_frames;
        result.pcx_decoded_bytes += evidence.pcx_decoded_bytes;
    }
    result.targets = try targets.toOwnedSlice(a);
    return result;
}
