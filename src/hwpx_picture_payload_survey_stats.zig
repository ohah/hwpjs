const std = @import("std");
const package = @import("hwpx/package.zig");
const manifest = @import("hwpx/content_manifest.zig");
const links = @import("hwpx/picture_image_links.zig");
const payloads = @import("hwpx/picture_image_payloads.zig");

pub const Group = struct {
    sites: usize = 0,
    non_embedded: usize = 0,
    targets: usize = 0,
    formats: [7]usize = @splat(0),
    mismatches: usize = 0,
    failures: usize = 0,
    png_failures: usize = 0,
    wmf_failures: usize = 0,
    tiff_failures: usize = 0,
    encoded_bytes: usize = 0,

    fn merge(self: *Group, other: Group) void {
        inline for (.{ "sites", "non_embedded", "targets", "mismatches", "failures", "png_failures", "wmf_failures", "tiff_failures", "encoded_bytes" }) |field| @field(self, field) += @field(other, field);
        for (&self.formats, other.formats) |*value, next| value.* += next;
    }
};

pub const Stats = struct {
    document: Group = .{},
    master: Group = .{},

    pub fn from(items: manifest.Manifest, known: *const package.KnownReport) !Stats {
        return .{
            .document = try check(items, &known.picture_image_links, &known.picture_image_payloads),
            .master = try check(items, &known.master_page_picture_image_links, &known.master_page_picture_image_payloads),
        };
    }

    pub fn merge(self: *Stats, other: Stats) void {
        self.document.merge(other.document);
        self.master.merge(other.master);
    }
};

fn check(items: manifest.Manifest, linked: *const links.Report, report: *const payloads.Report) !Group {
    try std.testing.expectEqual(linked.sites.len, report.sites);
    try std.testing.expectEqual(linked.sites.len - linked.count(.embedded), report.non_embedded_sites);
    var result: Group = .{ .sites = report.sites, .non_embedded = report.non_embedded_sites, .targets = report.targets.len, .mismatches = report.media_mismatches, .failures = report.inspection_failures, .encoded_bytes = report.encoded_bytes };
    var bytes: usize = 0;
    var references: usize = 0;
    var mismatches: usize = 0;
    var failures: usize = 0;
    for (report.targets) |target| {
        try std.testing.expect(target.item_index < items.items.len and target.first_site_index < linked.sites.len);
        try std.testing.expectEqual(@as(?usize, target.entry_index), items.items[target.item_index].entry_index);
        try std.testing.expectEqualStrings(items.items[target.item_index].id, linked.sites[target.first_site_index].id orelse return error.MissingPictureImageId);
        var count: usize = 0;
        var first: ?usize = null;
        for (linked.sites, 0..) |site, site_index| {
            if (site.target.state != .embedded or site.target.item_index.? != target.item_index) continue;
            count += 1;
            if (first == null) first = site_index;
        }
        try std.testing.expectEqual(first, @as(?usize, target.first_site_index));
        try std.testing.expectEqual(count, target.references);
        try std.testing.expect(count > 0);
        references += count;
        bytes += target.encoded_bytes;
        mismatches += @intFromBool(target.media_matches == false);
        failures += @intFromBool(target.inspection_error != null);
        if (target.format == .png and target.inspection_error != null) result.png_failures += 1;
        if (target.format == .wmf and target.inspection_error != null) result.wmf_failures += 1;
        if (target.format == .tiff and target.inspection_error != null) result.tiff_failures += 1;
        result.formats[@intFromEnum(target.format)] += 1;
    }
    try std.testing.expectEqual(linked.count(.embedded), references);
    try std.testing.expectEqual(report.encoded_bytes, bytes);
    try std.testing.expectEqual(report.media_mismatches, mismatches);
    try std.testing.expectEqual(report.inspection_failures, failures);
    try std.testing.expectEqual(report.unknown_formats, result.formats[@intFromEnum(payloads.Format.unknown)]);
    return result;
}
