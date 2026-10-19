//! Conservative dependency admission over unchanged source ownership.
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const Groups = @import("../body/list_groups.zig").Groups;
const Owner = @import("../body/formula_cell.zig").Owner;

pub fn affected(tree: Tree, groups: Groups, owner: Owner, expression: []const u8, edited: usize) !bool {
    const range = @import("../body/formula_range.zig").Range.parse(expression) catch return true;
    if (edited >= tree.nodes.len) return error.SourceBindingMismatch;
    var current: ?usize = edited;
    var within = false;
    while (current) |index| {
        if (index == owner.control_node) {
            within = true;
            break;
        }
        const parent = tree.nodes[index].parent;
        if (parent) |value| if (value >= index) return error.SourceBindingMismatch;
        current = parent;
    }
    if (!within) return false;
    const selection = try @import("../body/formula_selection.zig").Iterator.init(range, owner.origin, owner.columns, owner.rows);
    var selected: ?usize = null;
    for (groups.items, 0..) |group, index| {
        if (group.parent_node != owner.control_node or edited < group.begin or edited >= group.end) continue;
        if (selected != null) return error.AmbiguousFormulaCell;
        selected = index;
    }
    const group = groups.items[selected orelse return true];
    var entries = try @import("../body/table_lists.zig").Iterator.init(tree, owner.control_node);
    if (entries.table_node != owner.table_node) return error.SourceBindingMismatch;
    const table = tree.nodes[owner.table_node].record.value.table;
    if (table.row_count != owner.rows or table.column_count != owner.columns) return error.SourceBindingMismatch;
    while (entries.next()) |entry| {
        if (entry.node != group.header_node) continue;
        if (entry.kind != .cell) return true;
        const cell = try body.Cell.parse((try tree.nodes[entry.node].record.value.list_header.view(.observed8)).extra);
        const rectangle: @import("../body/table_grid.zig").Rectangle = .{ .column = cell.column, .row = cell.row, .column_span = cell.column_span, .row_span = cell.row_span };
        try rectangle.validate(table.row_count, table.column_count);
        return selection.intersects(.{
            .first = .{ .column = cell.column, .row = cell.row },
            .last = .{ .column = cell.column + cell.column_span - 1, .row = cell.row + cell.row_span - 1 },
        });
    }
    return error.InvalidTableOwner;
}

test "formula dependency scope includes nested table paragraphs in the outer source cell" {
    const std = @import("std");
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue5875/nested_table_text_caption.hwp", a, .limited(32_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, bytes);
    defer source.deinit();
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    var tree = try @import("source_tree.zig").parse(a, section, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try Groups.build(a, tree);
    defer groups.deinit(a);
    const expression = [_]u8{ 'S', 0, 'U', 0, 'M', 0, '(', 0, '?', 0, '?', 0, ')', 0 };
    var checked: usize = 0;
    for (groups.items) |outer| {
        const owner = @import("../body/formula_cell.zig").locate(tree, groups, outer.begin, .observed8) catch continue;
        for (groups.items) |inner| {
            if (inner.parent_node == outer.parent_node or inner.begin < outer.begin or inner.begin >= outer.end) continue;
            _ = @import("../body/formula_cell.zig").locate(tree, groups, inner.begin, .observed8) catch continue;
            try std.testing.expect(try affected(tree, groups, owner, &expression, inner.begin));
            checked += 1;
        }
    }
    try std.testing.expect(checked > 0);
}
