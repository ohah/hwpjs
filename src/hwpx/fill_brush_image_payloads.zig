const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const links = @import("fill_brush_image_links.zig");
const png = @import("../image/png/pixels.zig");
const jpeg = @import("../image/jpeg/structure.zig");
const bmp = @import("../image/bmp/structure.zig");
const gif = @import("../image/gif/document.zig");

pub const Format = enum { png, jpeg, bmp, gif, unknown };
pub const Inspection = enum { png_scanlines, jpeg_framing, bmp_structure, gif_indices, unsupported };

pub const Options = struct {
    max_targets: usize = 100_000,
    max_entry_bytes: usize = 64 * 1024 * 1024,
    max_total_encoded_bytes: usize = 512 * 1024 * 1024,
    max_total_png_decoded_bytes: usize = 256 * 1024 * 1024,
    max_total_gif_indices: usize = 256 * 1024 * 1024,
    max_total_gif_codes: usize = 256 * 1024 * 1024,
    max_total_gif_frames: usize = 10_000,
    png: png.Options = .{},
    jpeg: jpeg.Options = .{},
    bmp: bmp.Options = .{},
    gif: gif.Options = .{},
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
    media_matches: bool,
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
    gif_indices: usize,
    gif_codes: usize,
    gif_frames: usize,

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
    return .unknown;
}

pub fn mediaMatches(format: Format, media: []const u8) bool {
    return switch (format) {
        .png => std.mem.eql(u8, media, "image/png"),
        .jpeg => std.mem.eql(u8, media, "image/jpeg") or std.mem.eql(u8, media, "image/jpg"),
        .bmp => std.mem.eql(u8, media, "image/bmp"),
        .gif => std.mem.eql(u8, media, "image/gif"),
        .unknown => false,
    };
}

const Evidence = struct { png_decoded_bytes: usize = 0, gif_indices: usize = 0, gif_codes: usize = 0, gif_frames: usize = 0 };

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
        .unknown => return .{},
    }
}

/// Each embedded manifest item is ZIP-decoded and format-inspected once.
/// Raw sites retain absent/empty/missing/external states in the sibling link
/// report. Unknown bytes remain explicitly uninspected, not valid images.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: manifest.Manifest, image_links: *const links.Report, options: Options) !Report {
    const seen = try a.alloc(?usize, items.items.len);
    defer a.free(seen);
    @memset(seen, null);
    var targets: std.ArrayList(Target) = .empty;
    errdefer targets.deinit(a);
    var result: Report = .{ .sites = image_links.sites.len, .non_embedded_sites = 0, .targets = undefined, .media_mismatches = 0, .unknown_formats = 0, .inspection_failures = 0, .encoded_bytes = 0, .png_decoded_bytes = 0, .gif_indices = 0, .gif_codes = 0, .gif_frames = 0 };
    for (image_links.sites, 0..) |site, site_index| {
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
        const format = formatOf(bytes);
        var inspection_error: ?anyerror = null;
        const consumed: Evidence = .{ .png_decoded_bytes = result.png_decoded_bytes, .gif_indices = result.gif_indices, .gif_codes = result.gif_codes, .gif_frames = result.gif_frames };
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
                .bmp => .bmp_structure,
                .gif => .gif_indices,
                .unknown => .unsupported,
            },
            .inspection_error = inspection_error,
            .media_matches = matches,
        });
        seen[item_index] = targets.items.len - 1;
        result.encoded_bytes += bytes.len;
        result.media_mismatches += @intFromBool(!matches);
        result.unknown_formats += @intFromBool(format == .unknown);
        result.inspection_failures += @intFromBool(inspection_error != null);
        result.png_decoded_bytes += evidence.png_decoded_bytes;
        result.gif_indices += evidence.gif_indices;
        result.gif_codes += evidence.gif_codes;
        result.gif_frames += evidence.gif_frames;
    }
    result.targets = try targets.toOwnedSlice(a);
    return result;
}
