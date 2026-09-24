const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");
const header_resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");

const attribute_names = [_][]const u8{ "pageBreak", "repeatHeader", "noAdjust", "cellSpacing", "borderFillIDRef" };

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
    var attributes: [attribute_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, table, &attribute_names, &attributes);
    report.tables += 1;
    if (attributes[0]) |raw| {
        const value = try raw.toUtf8(a, max_bytes);
        defer a.free(value);
        if (std.mem.eql(u8, value, "NONE")) {
            report.page_break.none += 1;
        } else if (std.mem.eql(u8, value, "TABLE")) {
            report.page_break.table += 1;
        } else if (std.mem.eql(u8, value, "CELL")) {
            report.page_break.cell += 1;
        } else report.page_break.unknown += 1;
    } else report.page_break.absent += 1;
    _ = try table_xml.noteBoolean(a, attributes[1], max_bytes, &report.repeat_header);
    _ = try table_xml.noteBoolean(a, attributes[2], max_bytes, &report.no_adjust);
    if (attributes[3]) |raw| {
        const value = try table_xml.unsigned(a, raw, max_bytes);
        report.cell_spacing_zero += @intFromBool(value == 0);
        report.cell_spacing_sum = std.math.add(u64, report.cell_spacing_sum, value) catch return error.LimitExceeded;
    } else report.cell_spacing_absent += 1;
    const border_id: ?u32 = if (attributes[4]) |raw| try table_xml.unsigned(a, raw, max_bytes) else null;
    if (border_id) |id| {
        report.border_fill_zero += @intFromBool(id == 0);
        report.border_fill_sum = std.math.add(u64, report.border_fill_sum, id) catch return error.LimitExceeded;
    } else report.border_fill_absent += 1;
    if (border_fills) |inventory| _ = id_references.noteValue(&report.border_fill_references, border_id, inventory, tree.item_index);
}
