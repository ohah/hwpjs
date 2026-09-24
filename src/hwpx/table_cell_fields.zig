const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");

pub const size_names = [_][]const u8{ "width", "height" };
pub const margin_names = [_][]const u8{ "left", "right", "top", "bottom" };
pub const flag_names = [_][]const u8{ "header", "protect", "editable", "dirty" };
const cell_attribute_names = [_][]const u8{ "name", "header", "hasMargin", "protect", "editable", "dirty", "borderFillIDRef" };

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
    name_absent: usize = 0,
    name_present: usize = 0,
    name_empty: usize = 0,
    name_utf8_bytes: u64 = 0,
    flags: [flag_names.len]BooleanCounts = @splat(.{}),
    border_fill_absent: usize = 0,
    border_fill_present: usize = 0,
    border_fill_zero: usize = 0,
    border_fill_sum: u64 = 0,
};

fn noteBoolean(a: std.mem.Allocator, raw: ?xml.attribute_value.Value, max_bytes: usize, counts: *BooleanCounts) !?bool {
    const present = raw orelse {
        counts.absent += 1;
        return null;
    };
    const value = try table_xml.boolean(a, present, max_bytes);
    if (value) counts.true_value += 1 else counts.false_value += 1;
    return value;
}

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
    var attributes: [cell_attribute_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, cell, &cell_attribute_names, &attributes);
    if (attributes[0]) |raw| {
        const name = try raw.toUtf8(a, max_bytes);
        defer a.free(name);
        report.name_present += 1;
        report.name_empty += @intFromBool(name.len == 0);
        report.name_utf8_bytes = std.math.add(u64, report.name_utf8_bytes, name.len) catch return error.LimitExceeded;
    } else report.name_absent += 1;
    if (try noteBoolean(a, attributes[2], max_bytes, &report.has_margin)) |flag| {
        if (flag) {
            if (margin_missing) report.true_without_margin += 1;
        } else {
            if (!margin_missing) report.false_with_margin += 1;
        }
    }
    for ([_]usize{ 1, 3, 4, 5 }, 0..) |attribute_index, flag_index| {
        _ = try noteBoolean(a, attributes[attribute_index], max_bytes, &report.flags[flag_index]);
    }
    if (attributes[6]) |raw| {
        const id = try table_xml.unsigned(a, raw, max_bytes);
        report.border_fill_present += 1;
        report.border_fill_zero += @intFromBool(id == 0);
        report.border_fill_sum = std.math.add(u64, report.border_fill_sum, id) catch return error.LimitExceeded;
    } else report.border_fill_absent += 1;
    if (size) |index| try inspectSize(a, tree, index, max_bytes, report);
    if (margin) |index| try inspectMargin(a, tree, index, max_bytes, report);
}
