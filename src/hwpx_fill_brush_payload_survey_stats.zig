const std = @import("std");
const package = @import("hwpx/package.zig");
const manifest = @import("hwpx/content_manifest.zig");
const payloads = @import("hwpx/fill_brush_image_payloads.zig");
const links = @import("hwpx/fill_brush_image_links.zig");

pub const Stats = struct {
    targets: usize = 0,
    png: usize = 0,
    jpeg: usize = 0,
    bmp: usize = 0,
    gif: usize = 0,
    wmf: usize = 0,
    tiff: usize = 0,
    pcx: usize = 0,
    svg: usize = 0,
    mismatches: usize = 0,
    failures: usize = 0,
    encoded_bytes: usize = 0,
    master_targets: usize = 0,

    pub fn from(items: manifest.Manifest, known: *const package.KnownReport) !Stats {
        var result = try group(items, &known.fill_brush_image_links, &known.fill_brush_image_payloads);
        const master = try group(items, &known.master_page_fill_brush_image_links, &known.master_page_fill_brush_image_payloads);
        result.master_targets = master.targets;
        try std.testing.expectEqual(@as(usize, 0), master.png + master.jpeg + master.bmp + master.gif + master.wmf + master.tiff + master.pcx + master.svg + master.mismatches + master.failures + master.encoded_bytes);
        return result;
    }

    pub fn merge(self: *Stats, other: Stats) void {
        inline for (.{ "targets", "png", "jpeg", "bmp", "gif", "wmf", "tiff", "pcx", "svg", "mismatches", "failures", "encoded_bytes", "master_targets" }) |field| @field(self, field) += @field(other, field);
    }
};

fn group(items: manifest.Manifest, linked: *const links.Report, report: *const payloads.Report) !Stats {
    try std.testing.expectEqual(linked.sites.len, report.sites);
    try std.testing.expectEqual(linked.sites.len - linked.count(.embedded), report.non_embedded_sites);
    try std.testing.expectEqual(@as(usize, 0), report.unknown_formats);
    var result: Stats = .{ .targets = report.targets.len, .mismatches = report.media_mismatches, .failures = report.inspection_failures, .encoded_bytes = report.encoded_bytes };
    var references: usize = 0;
    var bytes: usize = 0;
    var mismatches: usize = 0;
    var invalid: usize = 0;
    for (report.targets) |target| {
        try std.testing.expect(target.item_index < items.items.len and target.first_site_index < linked.sites.len);
        try std.testing.expectEqual(@as(?usize, target.item_index), linked.sites[target.first_site_index].target.item_index);
        try std.testing.expectEqual(@as(?usize, target.entry_index), items.items[target.item_index].entry_index);
        try std.testing.expect(target.references > 0);
        try std.testing.expect(target.format != .unknown);
        references += target.references;
        bytes += target.encoded_bytes;
        mismatches += @intFromBool(target.media_matches == false);
        invalid += @intFromBool(target.inspection_error != null);
        switch (target.format) {
            .png => result.png += 1,
            .jpeg => result.jpeg += 1,
            .bmp => result.bmp += 1,
            .gif => result.gif += 1,
            .wmf => result.wmf += 1,
            .tiff => result.tiff += 1,
            .pcx => result.pcx += 1,
            .svg => result.svg += 1,
            .unknown => unreachable,
        }
    }
    try std.testing.expectEqual(linked.count(.embedded), references);
    try std.testing.expectEqual(report.encoded_bytes, bytes);
    try std.testing.expectEqual(report.media_mismatches, mismatches);
    try std.testing.expectEqual(report.inspection_failures, invalid);
    return result;
}
