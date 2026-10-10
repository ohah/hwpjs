const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");
const header_resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");

const values = @import("table_pagination_values.zig");

pub const PageBreakCounts = struct {
    absent: usize = 0,
    none: usize = 0,
    table: usize = 0,
    cell: usize = 0,
    unknown: usize = 0,
};

/// Values from the table element only. rowCnt/colCnt belong to table_geometry.
pub const Report = struct {
    tables: usize = 0,
    page_break: PageBreakCounts = .{},
    repeat_header: table_xml.BooleanCounts = .{},
    no_adjust: table_xml.BooleanCounts = .{},
    cell_spacing_absent: usize = 0,
    cell_spacing_zero: usize = 0,
    cell_spacing_sum: u64 = 0,
    border_fill_absent: usize = 0,
    border_fill_zero: usize = 0,
    border_fill_sum: u64 = 0,
    border_fill_references_checked: bool = false,
    border_fill_references: id_references.Counts = .{},
};

pub fn inspectTable(a: std.mem.Allocator, tree: *const tree_mod.Tree, table: usize, max_bytes: usize, border_fills: ?*const header_resources.Table, report: *Report) !void {
    const source = try values.read(a, tree, table, max_bytes);
    report.tables += 1;
    if (source.page_break) |value| {
        switch (value) {
            .none => report.page_break.none += 1,
            .table => report.page_break.table += 1,
            .cell => report.page_break.cell += 1,
            .unknown => report.page_break.unknown += 1,
        }
    } else report.page_break.absent += 1;
    noteBoolean(source.repeat_header, &report.repeat_header);
    noteBoolean(source.no_adjust, &report.no_adjust);
    if (source.cell_spacing) |value| {
        report.cell_spacing_zero += @intFromBool(value == 0);
        report.cell_spacing_sum = std.math.add(u64, report.cell_spacing_sum, value) catch return error.LimitExceeded;
    } else report.cell_spacing_absent += 1;
    const border_id = source.border_fill_id;
    if (border_id) |id| {
        report.border_fill_zero += @intFromBool(id == 0);
        report.border_fill_sum = std.math.add(u64, report.border_fill_sum, id) catch return error.LimitExceeded;
    } else report.border_fill_absent += 1;
    if (border_fills) |inventory| _ = id_references.noteValue(&report.border_fill_references, border_id, inventory, tree.item_index);
}

fn noteBoolean(value: ?bool, counts: *table_xml.BooleanCounts) void {
    if (value) |present| {
        if (present) counts.true_value += 1 else counts.false_value += 1;
    } else counts.absent += 1;
}
