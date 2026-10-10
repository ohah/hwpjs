//! Protect formula results and referenced cells, not every nested paragraph.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const Groups = @import("../body/list_groups.zig").Groups;

/// Unchanged source supplies list ownership and formula references. A generated
/// continuation uses its header template; current array positions are not IDs.
/// Full source/content eligibility is a separate caller-owned check.
pub fn validate(a: std.mem.Allocator, source: []const u8, version: Version, paragraph: model.Paragraph) !void {
    return validateLimited(a, source, version, paragraph, 1_000_000);
}

pub fn validateLimited(a: std.mem.Allocator, source: []const u8, version: Version, paragraph: model.Paragraph, inspections: usize) !void {
    if (paragraph.parent_node == null) return;
    var tree = try Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    var groups = try Groups.build(a, tree);
    defer groups.deinit(a);
    const node = if (paragraph.source_node != null) try paragraph.originalNode() else paragraph.header_template orelse return error.MissingParagraphTemplate;
    if (node >= tree.nodes.len or tree.nodes[node].record.value != .header) return error.SourceBindingMismatch;
    const parent: ?usize = if (paragraph.parent_node) |value| value else null;
    if (tree.nodes[node].parent != parent) return error.SourceBindingMismatch;
    const list = (try @import("paragraph_owner.zig").logicalOwner(tree, groups, node)) orelse return;
    var remaining = inspections;
    for (tree.nodes) |entry| {
        if (remaining == 0) return error.LimitExceeded;
        remaining -= 1;
        if (entry.record.value != .control_header) continue;
        const header = entry.record.value.control_header;
        if (header.id != @import("../body/control_rules.zig").id("%fmu")) continue;
        const cost = std.math.mul(usize, groups.items.len, 2) catch return error.LimitExceeded;
        if (cost > remaining) return error.LimitExceeded;
        remaining -= cost;
        const field_parent = entry.parent orelse return error.SourceBindingMismatch;
        const owner = try @import("../body/formula_cell.zig").locate(tree, groups, field_parent, .observed8);
        if (owner.list_node == list) return error.UnsupportedStructuralControl;
        if (parent != owner.control_node or list < owner.table_node) continue;
        const cell = try body.Cell.parse((try tree.nodes[list].record.value.list_header.view(.observed8)).extra);
        const span: @import("../body/table_grid.zig").Rectangle = .{ .column = cell.column, .row = cell.row, .column_span = cell.column_span, .row_span = cell.row_span };
        try span.validate(@intCast(owner.rows), @intCast(owner.columns));
        const properties = try @import("../body/field_start.zig").Properties.parse(header.properties);
        const view = try properties.formulaView();
        const selection = try @import("../body/formula_selection.zig").Iterator.init(try view.range(), owner.origin, owner.columns, owner.rows);
        const selection_cost = if (selection.rectangle != null) @as(usize, 1) else selection.count;
        if (selection_cost > remaining) return error.LimitExceeded;
        remaining -= selection_cost;
        if (selection.intersects(.{ .first = .{ .column = cell.column, .row = cell.row }, .last = .{ .column = @as(u32, cell.column) + cell.column_span - 1, .row = @as(u32, cell.row) + cell.row_span - 1 } })) return error.UnsupportedStructuralControl;
    }
}
