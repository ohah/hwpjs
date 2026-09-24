const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");

pub const size_names = [_][]const u8{ "width", "height" };
pub const margin_names = [_][]const u8{ "left", "right", "top", "bottom" };

pub const BooleanCounts = struct {
    absent: usize = 0,
    false_value: usize = 0,
    true_value: usize = 0,
};

/// Lexical observations only. High-bit unsigned margins are NOT coerced to
/// signed values, and hasMargin is NOT inferred from cellMargin presence.
pub const Report = struct {
    cells: usize = 0,
    size_elements: usize = 0,
    missing_size: usize = 0,
    duplicate_size: usize = 0,
    missing_size_field: [size_names.len]usize = @splat(0),
    zero_size_field: [size_names.len]usize = @splat(0),
    size_sum: [size_names.len]u64 = @splat(0),
    margin_elements: usize = 0,
    missing_margin: usize = 0,
    duplicate_margin: usize = 0,
    missing_margin_field: [margin_names.len]usize = @splat(0),
    zero_margin_field: [margin_names.len]usize = @splat(0),
    negative_margin_field: [margin_names.len]usize = @splat(0),
    highbit_margin_field: [margin_names.len]usize = @splat(0),
    margin_sum: [margin_names.len]i64 = @splat(0),
    has_margin: BooleanCounts = .{},
    true_without_margin: usize = 0,
    false_with_margin: usize = 0,
};

fn inspectSize(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_bytes: usize, report: *Report) !void {
    var raw: [size_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &size_names, &raw);
    report.size_elements += 1;
    for (raw, 0..) |value, field| {
        if (value) |present| {
            const parsed = try table_xml.unsigned(a, present, max_bytes);
            report.zero_size_field[field] += @intFromBool(parsed == 0);
            report.size_sum[field] = std.math.add(u64, report.size_sum[field], parsed) catch return error.LimitExceeded;
        } else report.missing_size_field[field] += 1;
    }
}

fn inspectMargin(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_bytes: usize, report: *Report) !void {
    var raw: [margin_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &margin_names, &raw);
    report.margin_elements += 1;
    for (raw, 0..) |value, field| {
        if (value) |present| {
            const parsed = try table_xml.margin(a, present, max_bytes);
            report.zero_margin_field[field] += @intFromBool(parsed == 0);
            report.negative_margin_field[field] += @intFromBool(parsed < 0);
            report.highbit_margin_field[field] += @intFromBool(parsed >= 0x80000000);
            report.margin_sum[field] = std.math.add(i64, report.margin_sum[field], parsed) catch return error.LimitExceeded;
        } else report.missing_margin_field[field] += 1;
    }
}

/// Inspects one already-selected direct hp:tc, independent of cellAddr/span
/// validity. No table-row or layout policy is duplicated here.
pub fn inspectCell(a: std.mem.Allocator, tree: *const tree_mod.Tree, cell: usize, max_bytes: usize, report: *Report) !void {
    report.cells += 1;
    const size = table_xml.uniqueChild(tree, cell, "cellSz", &report.missing_size, &report.duplicate_size);
    const missing_before = report.missing_margin;
    const margin = table_xml.uniqueChild(tree, cell, "cellMargin", &report.missing_margin, &report.duplicate_margin);
    const margin_missing = report.missing_margin != missing_before;
    const flag = try tree.attributeValue(a, cell, "", "hasMargin");
    if (flag) |present| {
        if (try table_xml.boolean(a, present, max_bytes)) {
            report.has_margin.true_value += 1;
            if (margin_missing) report.true_without_margin += 1;
        } else {
            report.has_margin.false_value += 1;
            if (!margin_missing) report.false_with_margin += 1;
        }
    } else report.has_margin.absent += 1;
    if (size) |index| try inspectSize(a, tree, index, max_bytes, report);
    if (margin) |index| try inspectMargin(a, tree, index, max_bytes, report);
}
