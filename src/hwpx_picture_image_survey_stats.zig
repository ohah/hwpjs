const std = @import("std");
const package = @import("hwpx/package.zig");
const manifest = @import("hwpx/content_manifest.zig");
const links = @import("hwpx/picture_image_links.zig");

pub const Group = struct {
    sites: usize = 0,
    embedded: usize = 0,
    external: usize = 0,
    empty: usize = 0,
    target_index_sum: usize = 0,

    fn merge(self: *Group, other: Group) void {
        inline for (.{ "sites", "embedded", "external", "empty", "target_index_sum" }) |field| @field(self, field) += @field(other, field);
    }
};

pub const Stats = struct {
    document: Group = .{},
    master: Group = .{},

    pub fn from(items: manifest.Manifest, known: *const package.KnownReport) !Stats {
        return .{
            .document = try check(items, &known.picture_image_links, .section),
            .master = try check(items, &known.master_page_picture_image_links, .master_page),
        };
    }

    pub fn merge(self: *Stats, other: Stats) void {
        self.document.merge(other.document);
        self.master.merge(other.master);
    }
};

fn check(items: manifest.Manifest, report: *const links.Report, kind: @import("hwpx/xml_part_tree.zig").PartKind) !Group {
    var result: Group = .{ .sites = report.sites.len, .embedded = report.count(.embedded), .external = report.count(.external), .empty = report.count(.empty) };
    try std.testing.expectEqual(@as(usize, 0), report.count(.absent) + report.count(.missing));
    try std.testing.expectEqual(result.sites, result.embedded + result.external + result.empty);
    for (report.sites) |site| {
        try std.testing.expect(site.part_kind == kind and site.picture_element_index < site.image_element_index);
        try std.testing.expectEqual(kind == .section, site.section_ordinal != null);
        if (site.target.item_index) |item_index| {
            try std.testing.expect(item_index < items.items.len);
            try std.testing.expectEqual(site.target.state == .embedded, items.items[item_index].entry_index != null);
            try std.testing.expectEqualStrings(items.items[item_index].id, site.id orelse return error.MissingPictureImageId);
            result.target_index_sum += item_index;
        } else {
            try std.testing.expect(site.target.state == .empty);
            try std.testing.expectEqualStrings("", site.id orelse return error.MissingPictureImageId);
        }
    }
    return result;
}
