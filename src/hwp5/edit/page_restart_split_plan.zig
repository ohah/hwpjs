//! Preparatory provenance plan only; this does not mutate or serialize a split.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Plan = struct {
    paragraph_node: u32,
    template_node: u32,
    control_node: usize,
    source_unit: usize,
    current_unit: u32,
    destination: enum { left, right },
    destination_unit: u32,
};

pub fn read(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, at: u32, char_count: usize) !Plan {
    const template_node = if (p.source_node == null) p.header_template orelse return error.MissingParagraphSource else try p.originalNode();
    if (p.field_attributes != null or p.formula_results != null) return error.UnsupportedStructuralControl;
    if (p.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    const eligible = try @import("plain_text_source.zig").validateStructureTransaction(a, source, version, p, char_count);
    if (eligible.preserved_direct_records != 1) return error.UnsupportedRestartSplit;
    var tree = try @import("source_tree.zig").parse(a, source, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    const index = (try @import("page_restart_source.zig").forParagraph(links.items, p)) orelse return error.UnsupportedRestartSplit;
    const link = links.items[index];
    const current = try @import("page_restart_current.zig").beforeSplit(a, tree, links.items, index, p) orelse return error.AmbiguousRestartSplit;
    const text = try @import("plain_text_content.zig").editableTextBytes(a, p);
    defer a.free(text);
    try @import("control_boundaries.zig").validateRetainedText(text);
    try @import("control_boundaries.zig").validate(text, at, at);
    const right = at <= current;
    return .{ .paragraph_node = @intCast(link.paragraph_node), .template_node = template_node, .control_node = link.control_node, .source_unit = link.start_unit, .current_unit = current, .destination = if (right) .right else .left, .destination_unit = if (right) current - at else current };
}
