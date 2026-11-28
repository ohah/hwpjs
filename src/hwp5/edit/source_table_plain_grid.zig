//! Scratch-arena validation of the plain physical grid used by split and merge.
const std = @import("std");
const grid = @import("source_table_grid.zig");
const geom = @import("source_table_cell_split_geometry.zig");
const body = @import("../body/reader.zig");
const tree_api = @import("../body/tree.zig");
const split = @import("source_table_cell_split.zig");

pub const Inventory = struct {
    tree: tree_api.Tree,
    marker: tree_api.Node,
    control: tree_api.Node,
    common: body.object_common.Properties,
    split_plan: ?split.Plan,
    cells: []const grid.Cell,
    metadata: []const body.Cell,
};

/// All returned slices and temporary allocations belong to the caller's arena.
pub fn inspect(scratch: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, request: grid.Request, limits: grid.Limits) !Inventory {
    if (source.len > limits.max_bytes) return error.LimitExceeded;
    const tree = try @import("source_tree.zig").parse(scratch, source, version, .{ .max_records = limits.max_records });
    if (request.table_node >= tree.nodes.len or tree.nodes[request.table_node].record.value != .table) return error.InvalidSourceTableGridTarget;
    const marker = tree.nodes[request.table_node];
    const table = marker.record.value.table;
    if (table.row_count != request.expected_rows or table.column_count != request.expected_columns) return error.SourceBindingMismatch;
    const split_plan = if (request.split) |division| try split.create(table.row_count, table.column_count, division, limits.max_cells) else null;
    if (table.row_count == 0 or table.column_count == 0) return error.InvalidSourceTableGrid;
    const slots = @as(usize, table.row_count) * table.column_count;
    if (slots > limits.max_cells) return error.LimitExceeded;
    if (table.extra.len != 0 or table.cell_spacing != 0 or (table.zones != null and table.zones.?.count() != 0)) return error.UnsupportedSourceTableGrid;
    if (marker.subtree_end != request.table_node + 1) return error.UnsupportedSourceTableGrid;
    const owner = marker.parent orelse return error.InvalidSourceTableGridTarget;
    const control = tree.nodes[owner];
    if (control.record.value != .control_header or control.record.value.control_header.id != @import("../body/control_rules.zig").table_id) return error.InvalidSourceTableGridTarget;
    const host = control.parent orelse return error.InvalidSourceTableGridTarget;
    if (tree.nodes[host].parent != null) return error.UnsupportedSourceTableGrid;
    const common = try body.object_common.parseControl(control.record.value.control_header);
    if (!body.object_common.hasAbsoluteDimensions(common.flags) or common.width == 0 or common.height == 0 or common.sizeProtected()) return error.UnsupportedSourceTableGrid;
    var groups = try @import("../body/list_groups.zig").Groups.build(scratch, tree);
    defer groups.deinit(scratch);
    const cells = try scratch.alloc(grid.Cell, slots);
    const metadata = try scratch.alloc(body.Cell, slots);
    const covered = try scratch.alloc(bool, slots);
    @memset(covered, false);
    const row_cells = try scratch.alloc(usize, table.row_count);
    @memset(row_cells, 0);
    var found: usize = 0;
    var previous: ?usize = null;
    for (groups.items) |group| {
        if (group.parent_node != owner) continue;
        geom.observe("source_cells", 1);
        if (found >= cells.len or group.header_node < request.table_node or group.paragraph_count == 0 or group.intervening_records != 0) return error.UnsupportedSourceTableGrid;
        const list = tree.nodes[group.header_node].record.value.list_header;
        if (list.signedCount() <= 0) return error.UnsupportedSourceTableGrid;
        const view = try list.view(request.layout);
        if (body.CellAttributes.fromList(view).isProtected()) return error.UnsupportedSourceTableGrid;
        const cell = try body.Cell.parse(view.extra);
        if (cell.extra.len != 0 or cell.width == 0 or cell.height == 0) return error.UnsupportedSourceTableGrid;
        if (cell.row_span == 0 or cell.column_span == 0 or cell.row >= table.row_count or cell.column >= table.column_count or
            cell.row_span > table.row_count - cell.row or cell.column_span > table.column_count - cell.column) return error.InvalidSourceTableGrid;
        const index = @as(usize, cell.row) * table.column_count + cell.column;
        if (previous) |prior| if (index <= prior) return error.InvalidSourceTableGrid;
        previous = index;
        for (cell.row..@as(usize, cell.row) + cell.row_span) |row| for (cell.column..@as(usize, cell.column) + cell.column_span) |column| {
            const slot = row * table.column_count + column;
            if (covered[slot]) return error.InvalidSourceTableGrid;
            covered[slot] = true;
            geom.observe("old_slots", 1);
        };
        row_cells[cell.row] += 1;
        var paragraph = group.begin;
        var first_runs: ?usize = null;
        var last_header = paragraph;
        while (paragraph < group.end) {
            const runs = try grid.validateParagraph(tree, paragraph, group.end);
            if (first_runs == null) first_runs = runs;
            last_header = paragraph;
            paragraph = tree.nodes[paragraph].subtree_end;
        }
        cells[found] = .{ .group = group, .header = group.begin, .last_header = last_header, .runs = first_runs orelse return error.UnsupportedSourceTableGrid, .value = cell };
        metadata[found] = cell;
        found += 1;
    }
    for (covered) |present| if (!present) return error.InvalidSourceTableGrid;
    for (row_cells, 0..) |count, row| if (count != table.rows.get(row).?.size) return error.InvalidSourceTableGrid;
    var child = owner + 1;
    var cursor: usize = 0;
    while (child < control.subtree_end) {
        if (child == request.table_node) {
            child = marker.subtree_end;
            continue;
        }
        if (cursor >= found or cells[cursor].group.header_node != child) return error.UnsupportedSourceTableGrid;
        child = cells[cursor].group.end;
        cursor += 1;
    }
    if (cursor != found) return error.InvalidSourceTableGrid;
    return .{ .tree = tree, .marker = marker, .control = control, .common = common, .split_plan = split_plan, .cells = cells[0..found], .metadata = metadata[0..found] };
}
