//! Physical HWP5 OLE candidates, not an assertion that each object is a chart.
//! Layout selection is explicit. Shared body validators retain owner/group rules.
const std = @import("std");
const ole = @import("../body/ole.zig");
const drawing = @import("../edit/drawing_sources.zig");
pub const Site = struct {
    section_source_sha256: [32]u8,
    control_node: usize,
    component_node: usize,
    ole_node: usize,
    paragraph_node: usize,
    paragraph: usize,
    source_unit: usize,
    current_unit: u32,
    ordinal: u16,
    ole_layout: ole.Layout,
    attributes: u32,
    extent_x: i32,
    extent_y: i32,
    opaque_tail_bytes: usize,
    geometry: drawing.Source,
};

/// Index joins use expected O(records + tokens + links) HashMap time.
/// Existing format validators keep their own cost; no per-site source scans are added.
/// Sources use the same raw section basis as the caller's current paragraphs.
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph, layout: ole.Layout) ![]Site {
    return collect(a, raw, version, paragraphs, .{ .explicit = layout }, null, true);
}
/// Unresolved physical observations are never resource admission or write authority.
pub fn observe(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph, layout: ole.Layout) ![]Site {
    return collect(a, raw, version, paragraphs, .{ .explicit = layout }, null, false);
}
pub fn readForOwner(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph, layout: ole.Layout, control: usize) ![]Site {
    return collect(a, raw, version, paragraphs, .{ .explicit = layout }, control, true);
}
pub fn observeSelected(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph, selection: ole.Selection) ![]Site {
    return collect(a, raw, version, paragraphs, selection, null, false);
}
pub fn readSelectedForOwner(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph, selection: ole.Selection, control: usize) ![]Site {
    return collect(a, raw, version, paragraphs, selection, control, true);
}
fn collect(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph, selection: ole.Selection, selected: ?usize, require_ordinal: bool) ![]Site {
    var tree = try @import("../edit/source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    _ = try @import("../body/ole_validation.zig").inspectSelected(tree, selection, null, .uninspected);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    const positions = try @import("../edit/current_control_anchor_index.zig").positions(a, links.items, paragraphs);
    defer a.free(positions);
    var owners = try @import("../edit/current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    var by_control: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer by_control.deinit(a);
    for (links.items, 0..) |link, index| {
        const entry = try by_control.getOrPut(a, link.control_node);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
    }
    const sources = try drawing.read(a, raw, version);
    defer a.free(sources);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &digest, .{});
    var output: std.ArrayList(Site) = .empty;
    errdefer output.deinit(a);
    for (sources) |source| {
        if (source.kind_id != @import("../body/control_rules.zig").id("$ole")) continue;
        if (selected) |control| if (source.control_node != control) continue;
        // Group descendants are not promoted to unrelated top-level owners.
        if (tree.nodes[source.component_node].parent != source.control_node) return error.InvalidDrawingOwner;
        const index = by_control.get(source.control_node) orelse return error.MissingCurrentControlAnchor;
        const link = links.items[index];
        if (link.header_id != @import("../body/control_rules.zig").drawing_id or link.code != 11 or link.paragraph_node != source.paragraph_node) return error.SourceBindingMismatch;
        const parent = std.math.cast(u32, source.paragraph_node) orelse return error.MissingCurrentDrawingOwner;
        const paragraph = owners.get(parent) orelse return error.MissingCurrentDrawingOwner;
        const child = (try @import("../body/owned_record.zig").find(tree, source.component_node, ole.tag)) orelse return error.MissingOle;
        const value = try ole.Properties.read(tree.nodes[child].record.framing.payload, selection);
        // Zero has no verified resource meaning; never turn it into an ordinal.
        if (require_ordinal and value.bin_data_id == 0) return error.InvalidOleBinaryReference;
        try output.append(a, .{
            .section_source_sha256 = digest,
            .control_node = source.control_node,
            .component_node = source.component_node,
            .ole_node = child,
            .paragraph_node = source.paragraph_node,
            .paragraph = paragraph,
            .source_unit = link.start_unit,
            .current_unit = positions[index],
            .ordinal = value.bin_data_id,
            .ole_layout = value.layout,
            .attributes = value.attributes,
            .extent_x = value.extent_x,
            .extent_y = value.extent_y,
            .opaque_tail_bytes = value.extra.len,
            .geometry = source,
        });
    }
    return output.toOwnedSlice(a);
}
