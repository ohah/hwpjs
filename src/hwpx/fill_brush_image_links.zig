const std = @import("std");
const part_tree = @import("xml_part_tree.zig");
const fill_brush = @import("fill_brush.zig");
const manifest = @import("content_manifest.zig");
const binary_links = @import("binary_reference_links.zig");

pub const Options = struct {
    max_sites: usize = 500_000,
};

pub const Site = struct {
    brush_index: usize,
    node_index: usize,
    part_kind: part_tree.PartKind,
    part_item_index: usize,
    section_ordinal: ?usize,
    element_index: usize,
    target: binary_links.Target,
};

pub const Report = struct {
    header_and_sections: usize,
    master_pages: usize,
    sites: []Site,
    counts: [@typeInfo(binary_links.TargetState).@"enum".fields.len]usize,

    pub fn count(self: *const Report, state: binary_links.TargetState) usize {
        return self.counts[@intFromEnum(state)];
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.sites);
        self.* = undefined;
    }
};

/// Maps every raw core imgBrush/img node to the same OPF ID resolver used by
/// binary_reference_scan. The source report owns each raw ID; this result
/// owns only scalar provenance and target indices.
pub fn inspect(a: std.mem.Allocator, items: manifest.Manifest, brushes: *const fill_brush.Report, options: Options) !Report {
    var index = try binary_links.Index.init(a, items);
    defer index.deinit(a);
    var sites: std.ArrayList(Site) = .empty;
    errdefer sites.deinit(a);
    var counts: [@typeInfo(binary_links.TargetState).@"enum".fields.len]usize = @splat(0);
    for (brushes.nodes, 0..) |node, node_index| {
        if (node.kind != .image) continue;
        if (sites.items.len == options.max_sites) return error.LimitExceeded;
        if (node.brush_index >= brushes.brushes.len) return error.InvalidBrushReport;
        const parent_index = node.parent_node_index orelse return error.InvalidBrushReport;
        if (parent_index >= node_index or brushes.nodes[parent_index].kind != .img_brush or brushes.nodes[parent_index].brush_index != node.brush_index or brushes.nodes[parent_index].element_index >= node.element_index) return error.InvalidBrushReport;
        const brush = brushes.brushes[node.brush_index];
        const target = binary_links.resolve(&index, items, node.get(.binary_item_id_ref));
        try sites.append(a, .{
            .brush_index = node.brush_index,
            .node_index = node_index,
            .part_kind = brush.part_kind,
            .part_item_index = brush.part_item_index,
            .section_ordinal = brush.section_ordinal,
            .element_index = node.element_index,
            .target = target,
        });
        counts[@intFromEnum(target.state)] += 1;
    }
    return .{
        .header_and_sections = brushes.header_and_sections,
        .master_pages = brushes.master_pages,
        .sites = try sites.toOwnedSlice(a),
        .counts = counts,
    };
}
