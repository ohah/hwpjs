const std = @import("std");
const grid = @import("table_grid.zig");
const Tree = @import("tree.zig").Tree;
const body = @import("reader.zig");
const lists = @import("table_lists.zig");
const rules = @import("../docinfo/reference_rules.zig");
const table_id = @import("control_rules.zig").table_id;
pub const Options = struct { list_layout: body.list_header.Layout, zone_layout: body.table.zone.Layout, border_count: usize };
pub const Report = struct { tables: usize = 0, cells: usize = 0, captions: usize = 0, zones: usize = 0 };
fn border(id: u16, count: usize) !void {
    if (rules.resolve(.optional_one_based, id, count) == .invalid) return error.InvalidResourceReference;
}
/// Ownership, payload bounds, span bounds, total count and known border references.
/// Also checks row distribution, non-overlap and complete logical grid coverage.
/// Does not interpret extension tails or visual layout.
/// Paragraph/list counts and control links have their own validators.
pub fn inspect(a: std.mem.Allocator, tree: Tree, options: Options) !Report {
    var report: Report = .{};
    for (tree.nodes, 0..) |n, index| {
        if (n.record.value == .table) {
            const parent = n.parent orelse return error.OrphanTableRecord;
            const p = tree.nodes[parent].record.value;
            if (p != .control_header or p.control_header.id != table_id) return error.OrphanTableRecord;
        }
        if (n.record.value != .control_header or n.record.value.control_header.id != table_id) continue;
        const paragraph = n.parent orelse return error.OrphanTableControl;
        if (tree.nodes[paragraph].record.value != .header) return error.OrphanTableControl;
        var it = try lists.Iterator.init(tree, index);
        const t = tree.nodes[it.table_node].record.value.table;
        if (t.row_count == 0 or t.column_count == 0) return error.InvalidTableDimensions;
        try border(t.border_fill_id, options.border_count);
        if (t.zones) |zones| for (0..zones.count()) |i| {
            const z = zones.get(i).?;
            const v = z.view(options.zone_layout);
            if (v.start_row > v.end_row or v.start_column > v.end_column or v.end_row >= t.row_count or v.end_column >= t.column_count) return error.InvalidTableZone;
            try border(z.border_fill_id, options.border_count);
            report.zones += 1;
        };
        var declared: usize = 0;
        for (0..t.rows.count()) |i| declared += t.rows.get(i).?.size;
        var rectangles: std.ArrayList(grid.Rectangle) = .empty;
        defer rectangles.deinit(a);
        while (it.next()) |entry| {
            const view = try tree.nodes[entry.node].record.value.list_header.view(options.list_layout);
            switch (entry.kind) {
                .caption => {
                    _ = try body.Caption.parse(view.extra);
                    report.captions += 1;
                },
                .cell => {
                    const c = try body.Cell.parse(view.extra);
                    const rectangle: grid.Rectangle = .{ .row = c.row, .column = c.column, .row_span = c.row_span, .column_span = c.column_span };
                    try rectangle.validate(t.row_count, t.column_count);
                    try border(c.border_fill_id, options.border_count);
                    try rectangles.append(a, rectangle);
                },
            }
        }
        if (rectangles.items.len != declared) return error.TableCellCountMismatch;
        try grid.validate(a, t.row_count, t.column_count, t.rows, rectangles.items);
        report.cells += rectangles.items.len;
        report.tables += 1;
    }
    return report;
}
