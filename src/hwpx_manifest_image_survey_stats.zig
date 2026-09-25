const std = @import("std");
const manifest = @import("hwpx/content_manifest.zig");
const payloads = @import("hwpx/manifest_image_payloads.zig");
const image = @import("hwpx/image_payloads.zig");
const package = @import("hwpx/package.zig");

fn hasEmbeddedSite(sites: anytype, item_index: usize) bool {
    for (sites) |site| {
        if (site.target.state == .embedded and site.target.item_index != null and site.target.item_index.? == item_index) return true;
    }
    return false;
}

fn referencedByPictureOrBrush(known: *const package.KnownReport, item_index: usize) bool {
    return hasEmbeddedSite(known.picture_image_links.sites, item_index) or
        hasEmbeddedSite(known.master_page_picture_image_links.sites, item_index) or
        hasEmbeddedSite(known.fill_brush_image_links.sites, item_index) or
        hasEmbeddedSite(known.master_page_fill_brush_image_links.sites, item_index);
}

pub const Stats = struct {
    sites: usize = 0,
    external: usize = 0,
    targets: usize = 0,
    formats: [std.meta.fields(image.Format).len]usize = @splat(0),
    mismatches: usize = 0,
    encoded_bytes: usize = 0,
    invalid_svg: usize = 0,
    without_picture_brush_ref: usize = 0,
    bmp_decoded: usize = 0,
    bmp_file_size_failures: usize = 0,
    bmp_image_size_failures: usize = 0,
    bmp_other_failures: usize = 0,
    bmp_rgba_bytes: usize = 0,

    pub fn from(items: manifest.Manifest, known: *const package.KnownReport) !Stats {
        const report = &known.manifest_image_payloads;
        var result: Stats = .{ .sites = report.sites, .external = report.non_embedded_sites, .targets = report.targets.len, .mismatches = report.media_mismatches, .encoded_bytes = report.encoded_bytes, .bmp_rgba_bytes = report.bmp_rgba_bytes };
        var candidates: usize = 0;
        var external: usize = 0;
        var target_cursor: usize = 0;
        for (items.items, 0..) |item, item_index| {
            if (!payloads.isCandidate(item)) continue;
            if (item.entry_index != null) {
                try std.testing.expect(target_cursor < report.targets.len);
                try std.testing.expectEqual(item_index, report.targets[target_cursor].item_index);
                try std.testing.expectEqual(candidates, report.targets[target_cursor].first_site_index);
                target_cursor += 1;
            }
            candidates += 1;
            external += @intFromBool(item.entry_index == null);
        }
        try std.testing.expectEqual(candidates, report.sites);
        try std.testing.expectEqual(external, report.non_embedded_sites);
        try std.testing.expectEqual(candidates - external, report.targets.len);
        try std.testing.expectEqual(target_cursor, report.targets.len);
        var bytes: usize = 0;
        var mismatches: usize = 0;
        for (report.targets) |target| {
            try std.testing.expect(target.item_index < items.items.len);
            try std.testing.expect(payloads.isCandidate(items.items[target.item_index]));
            try std.testing.expectEqual(@as(?usize, target.entry_index), items.items[target.item_index].entry_index);
            try std.testing.expectEqual(@as(usize, 1), target.references);
            result.formats[@intFromEnum(target.format)] += 1;
            bytes += target.encoded_bytes;
            mismatches += @intFromBool(target.media_matches == false);
            result.invalid_svg += @intFromBool(target.format == .svg and target.inspection_error != null);
            if (target.format == .bmp) {
                try std.testing.expectEqual(image.Inspection.bmp_rgba, target.inspection);
                if (target.inspection_error) |err| switch (err) {
                    error.TrailingBmpBytes, error.UnexpectedEnd => result.bmp_file_size_failures += 1,
                    error.InvalidBmpImageSize => result.bmp_image_size_failures += 1,
                    else => result.bmp_other_failures += 1,
                } else result.bmp_decoded += 1;
            }
            result.without_picture_brush_ref += @intFromBool(!referencedByPictureOrBrush(known, target.item_index));
        }
        try std.testing.expectEqual(report.encoded_bytes, bytes);
        try std.testing.expectEqual(report.media_mismatches, mismatches);
        try std.testing.expectEqual(report.unknown_formats, result.formats[@intFromEnum(image.Format.unknown)]);
        return result;
    }

    pub fn merge(self: *Stats, other: Stats) void {
        inline for (.{ "sites", "external", "targets", "mismatches", "encoded_bytes", "invalid_svg", "without_picture_brush_ref", "bmp_decoded", "bmp_file_size_failures", "bmp_image_size_failures", "bmp_other_failures", "bmp_rgba_bytes" }) |field| @field(self, field) += @field(other, field);
        for (&self.formats, other.formats) |*value, next| value.* += next;
    }
};
