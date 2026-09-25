const std = @import("std");
const package = @import("hwpx/package.zig");
const manifest = @import("hwpx/content_manifest.zig");
const links = @import("hwpx/fill_brush_image_links.zig");
const brushes = @import("hwpx/fill_brush.zig");

pub const Stats = struct {
    document_sites: usize = 0,
    master_sites: usize = 0,
    document_embedded: usize = 0,
    master_embedded: usize = 0,
    document_target_index_sum: usize = 0,
    master_target_index_sum: usize = 0,

    pub fn from(items: manifest.Manifest, known: *const package.KnownReport) !Stats {
        var result: Stats = .{};
        const document = try check(items, &known.fill_brushes, &known.fill_brush_image_links);
        const master = try check(items, &known.master_page_fill_brushes, &known.master_page_fill_brush_image_links);
        result.document_sites = document.sites;
        result.master_sites = master.sites;
        result.document_embedded = document.embedded;
        result.master_embedded = master.embedded;
        result.document_target_index_sum = document.target_index_sum;
        result.master_target_index_sum = master.target_index_sum;
        try std.testing.expectEqual(result.document_sites, known.binary_references.counts(.header_brush_image).sites + known.binary_references.counts(.section_brush_image).sites);
        try std.testing.expectEqual(result.master_sites, known.master_page_binary_references.counts(.master_brush_image).sites);
        return result;
    }

    pub fn merge(self: *Stats, other: Stats) void {
        inline for (.{ "document_sites", "master_sites", "document_embedded", "master_embedded", "document_target_index_sum", "master_target_index_sum" }) |field| @field(self, field) += @field(other, field);
    }
};

const Group = struct { sites: usize = 0, embedded: usize = 0, target_index_sum: usize = 0 };

fn check(items: manifest.Manifest, raw: *const brushes.Report, linked: *const links.Report) !Group {
    try std.testing.expectEqual(raw.header_and_sections, linked.header_and_sections);
    try std.testing.expectEqual(raw.master_pages, linked.master_pages);
    try std.testing.expectEqual(raw.count(.image), linked.sites.len);
    var result: Group = .{ .sites = linked.sites.len, .embedded = linked.count(.embedded) };
    try std.testing.expectEqual(result.sites, result.embedded);
    for (linked.sites) |site| {
        try std.testing.expect(site.node_index < raw.nodes.len and site.brush_index < raw.brushes.len);
        const node = raw.nodes[site.node_index];
        const brush = raw.brushes[site.brush_index];
        try std.testing.expect(node.kind == .image and node.brush_index == site.brush_index);
        try std.testing.expectEqual(brush.part_kind, site.part_kind);
        try std.testing.expectEqual(brush.part_item_index, site.part_item_index);
        try std.testing.expectEqual(brush.section_ordinal, site.section_ordinal);
        try std.testing.expectEqual(node.element_index, site.element_index);
        const target_index = site.target.item_index orelse return error.MissingBrushImageTarget;
        try std.testing.expect(target_index < items.items.len);
        try std.testing.expect(items.items[target_index].entry_index != null);
        try std.testing.expectEqualStrings(items.items[target_index].id, node.get(.binary_item_id_ref) orelse return error.MissingBrushImageId);
        result.target_index_sum += target_index;
    }
    return result;
}
