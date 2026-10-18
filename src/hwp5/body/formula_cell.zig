//! Formula origin in a typed source tree; never infers the most recent list.
const Tree = @import("tree.zig").Tree;
const Groups = @import("list_groups.zig").Groups;
const body = @import("reader.zig");
const ranges = @import("formula_range.zig");
pub const Owner = struct {
    control_node: usize,
    table_node: usize,
    list_node: usize,
    origin: ranges.Cell,
    columns: u32,
    rows: u32,
};

/// Requires a decoded Tree and Groups built from that unchanged tree.
pub fn locate(tree: Tree, groups: Groups, paragraph: usize, layout: body.list_header.Layout) !Owner {
    if (paragraph >= tree.nodes.len or tree.nodes[paragraph].record.value != .header) return error.InvalidParagraph;
    const parent = tree.nodes[paragraph].parent orelse return error.FormulaOutsideTable;
    var list_node: ?usize = null;
    for (groups.items) |group| {
        if (group.parent_node == parent and paragraph >= group.begin and paragraph < group.end) {
            if (list_node != null) return error.AmbiguousFormulaCell;
            list_node = group.header_node;
        }
    }
    const list = list_node orelse return error.OrphanListParagraph;
    var iterator = try @import("table_lists.zig").Iterator.init(tree, parent);
    while (iterator.next()) |entry| {
        if (entry.node != list) continue;
        return fromEntry(tree, parent, list, iterator.table_node, entry.kind, layout);
    }
    return error.InvalidTableOwner;
}

/// Same cell decoding, with ownership already mapped from this source tree.
pub fn locateIndexed(a: @import("std").mem.Allocator, index: *@import("table_list_index.zig").Index, flows: @import("paragraph_flows.zig").Flows, paragraph: usize, layout: body.list_header.Layout) !Owner {
    const tree = index.tree;
    if (paragraph >= tree.nodes.len or tree.nodes[paragraph].record.value != .header) return error.InvalidParagraph;
    const parent = tree.nodes[paragraph].parent orelse return error.FormulaOutsideTable;
    const list = try flows.get(paragraph);
    const entry = try index.get(a, parent, list);
    return fromEntry(tree, parent, list, entry.table_node, entry.kind, layout);
}

fn fromEntry(tree: Tree, parent: usize, list: usize, table_node: usize, kind: @import("table_lists.zig").Kind, layout: body.list_header.Layout) !Owner {
    if (kind != .cell) return error.FormulaInCaption;
    const header = tree.nodes[list].record.value.list_header;
    const cell = try body.Cell.parse((try header.view(layout)).extra);
    const table = tree.nodes[table_node].record.value.table;
    const rectangle: @import("table_grid.zig").Rectangle = .{ .column = cell.column, .row = cell.row, .column_span = cell.column_span, .row_span = cell.row_span };
    try rectangle.validate(table.row_count, table.column_count);
    return .{
        .control_node = parent,
        .table_node = table_node,
        .list_node = list,
        .origin = .{ .column = cell.column, .row = cell.row },
        .columns = table.column_count,
        .rows = table.row_count,
    };
}
