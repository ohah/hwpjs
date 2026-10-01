//! Scalar evaluation of observed SUM/AVG over plain source cells.
//! Does not use formula display caches as input or modify any document value.
const std = @import("std");
const Tree = @import("tree.zig").Tree;
const Groups = @import("list_groups.zig").Groups;
const body = @import("reader.zig");
const ranges = @import("formula_range.zig");
const Owner = @import("formula_cell.zig").Owner;
pub const Limits = struct { cells: usize = 100_000, inspections: usize = 1_000_000 };
pub const Result = struct { value: f64, cells: usize };

pub fn evaluate(tree: Tree, groups: Groups, owner: Owner, range: ranges.Range, layout: body.list_header.Layout, limits: Limits) !Result {
    return evaluateWith(tree, groups, owner, range, layout, limits, SourceReader{});
}

const SourceReader = struct {
    fn read(_: SourceReader, tree: Tree, group: @import("list_groups.zig").Group) !f64 {
        return cellNumber(tree, group);
    }
};

pub fn evaluateWith(tree: Tree, groups: Groups, owner: Owner, range: ranges.Range, layout: body.list_header.Layout, limits: Limits, reader: anytype) !Result {
    const iterator = try @import("table_lists.zig").Iterator.init(tree, owner.control_node);
    if (iterator.table_node != owner.table_node) return error.SourceBindingMismatch;
    const table = tree.nodes[owner.table_node].record.value.table;
    if (table.row_count != owner.rows or table.column_count != owner.columns) return error.SourceBindingMismatch;
    const rectangle = try range.resolve(owner.origin, owner.columns, owner.rows);
    const width = @as(usize, rectangle.last.column - rectangle.first.column) + 1;
    const height = @as(usize, rectangle.last.row - rectangle.first.row) + 1;
    const count = std.math.mul(usize, width, height) catch return error.LimitExceeded;
    if (count > limits.cells) return error.LimitExceeded;
    var remaining = limits.inspections;
    var sum: f64 = 0;
    for (rectangle.first.row..rectangle.last.row + 1) |row| {
        for (rectangle.first.column..rectangle.last.column + 1) |column| {
            var found: ?usize = null;
            for (groups.items, 0..) |group, index| {
                if (remaining == 0) return error.LimitExceeded;
                remaining -= 1;
                if (group.parent_node != owner.control_node or group.header_node < owner.table_node) continue;
                const cell = try body.Cell.parse((try tree.nodes[group.header_node].record.value.list_header.view(layout)).extra);
                const span: @import("table_grid.zig").Rectangle = .{ .column = cell.column, .row = cell.row, .column_span = cell.column_span, .row_span = cell.row_span };
                try span.validate(table.row_count, table.column_count);
                if (column < cell.column or row < cell.row or column - cell.column >= cell.column_span or row - cell.row >= cell.row_span) continue;
                if (cell.column_span != 1 or cell.row_span != 1) return error.UnsupportedMergedFormulaCell;
                if (found != null) return error.AmbiguousFormulaCell;
                found = index;
            }
            const group = groups.items[found orelse return error.MissingFormulaCell];
            sum += try reader.read(tree, group);
            if (!std.math.isFinite(sum)) return error.FormulaNumericOverflow;
        }
    }
    return .{ .value = if (range.function == .average) sum / @as(f64, @floatFromInt(count)) else sum, .cells = count };
}

pub fn paragraphNode(tree: Tree, group: @import("list_groups.zig").Group) !usize {
    if (group.paragraph_count != 1) return error.UnsupportedFormulaCellText;
    var paragraph: ?usize = null;
    var node = group.begin;
    while (node < group.end) {
        if (tree.nodes[node].record.value == .header) paragraph = node;
        node = tree.nodes[node].subtree_end;
    }
    return paragraph orelse return error.MissingFormulaCell;
}

fn cellNumber(tree: Tree, group: @import("list_groups.zig").Group) !f64 {
    const header_node = try paragraphNode(tree, group);
    const header = tree.nodes[header_node].record.value.header;
    var text: ?body.Text = null;
    var node = header_node + 1;
    while (node < tree.nodes[header_node].subtree_end) {
        if (tree.nodes[node].record.value == .text) {
            if (text != null) return error.UnsupportedFormulaCellText;
            text = tree.nodes[node].record.value.text;
        }
        node = tree.nodes[node].subtree_end;
    }
    const value = text orelse return error.UnsupportedFormulaCellText;
    return numberFromText(value.raw, header.characterUnits());
}

pub fn numberFromText(bytes: []const u8, declared_units: u32) !f64 {
    const value = try body.Text.parse(bytes);
    if (declared_units != value.raw.len / 2) return error.ParagraphTextCountMismatch;
    var tokens = value.tokens();
    var ended = false;
    while (try tokens.next()) |token| {
        if (ended) return error.UnsupportedFormulaCellText;
        if (token.value == .control) {
            if (token.value.control.code != 13) return error.UnsupportedFormulaCellDependency;
            ended = true;
        }
    }
    if (!ended) return error.UnsupportedFormulaCellText;
    return @import("formula_number.zig").parse(value.raw[0 .. value.raw.len - 2]);
}
