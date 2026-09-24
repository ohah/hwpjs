const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");
const header_resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");

pub const margin_names = table_xml.margin_names;
pub const coordinate_names = [_][]const u8{ "startRowAddr", "startColAddr", "endRowAddr", "endColAddr" };
const zone_attribute_names = coordinate_names ++ [_][]const u8{"borderFillIDRef"};

pub const Options = struct {
    max_margin_elements: usize = 100_000,
    max_zone_lists: usize = 100_000,
    max_zones: usize = 1_000_000,
};

/// Direct children of an already selected hp:tbl. Does not apply layout.
pub const Report = struct {
    tables: usize = 0,
    in_margins: usize = 0,
    missing_in_margin: usize = 0,
    duplicate_in_margin: usize = 0,
    margin_missing: [margin_names.len]usize = @splat(0),
    margin_zero: [margin_names.len]usize = @splat(0),
    margin_negative: [margin_names.len]usize = @splat(0),
    margin_highbit: [margin_names.len]usize = @splat(0),
    margin_sum: [margin_names.len]i64 = @splat(0),
    zone_lists: usize = 0,
    missing_zone_list: usize = 0,
    duplicate_zone_list: usize = 0,
    empty_zone_lists: usize = 0,
    other_zone_list_children: usize = 0,
    zones: usize = 0,
    coordinate_absent: [coordinate_names.len]usize = @splat(0),
    coordinate_sum: [coordinate_names.len]u64 = @splat(0),
    inverted_zones: usize = 0,
    outside_grid: usize = 0,
    border_absent: usize = 0,
    border_zero: usize = 0,
    border_sum: u64 = 0,
    border_references_checked: bool = false,
    border_references: id_references.Counts = .{},
};

fn inspectMargin(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_bytes: usize, report: *Report) !void {
    var raw: [margin_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &margin_names, &raw);
    for (raw, 0..) |attribute, field| {
        if (attribute) |present| {
            const value = try table_xml.margin(a, present, max_bytes);
            report.margin_zero[field] += @intFromBool(value == 0);
            report.margin_negative[field] += @intFromBool(value < 0);
            report.margin_highbit[field] += @intFromBool(value >= 0x80000000);
            report.margin_sum[field] = std.math.add(i64, report.margin_sum[field], value) catch return error.LimitExceeded;
        } else report.margin_missing[field] += 1;
    }
}

fn inspectZone(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, rows: ?u32, cols: ?u32, max_bytes: usize, options: Options, border_fills: ?*const header_resources.Table, report: *Report) !void {
    if (report.zones == options.max_zones) return error.LimitExceeded;
    report.zones += 1;
    var raw: [zone_attribute_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &zone_attribute_names, &raw);
    var coordinates: [coordinate_names.len]?u32 = undefined;
    for (0..coordinate_names.len) |field| {
        coordinates[field] = if (raw[field]) |present| try table_xml.unsigned(a, present, max_bytes) else null;
        if (coordinates[field]) |value| {
            report.coordinate_sum[field] = std.math.add(u64, report.coordinate_sum[field], value) catch return error.LimitExceeded;
        } else report.coordinate_absent[field] += 1;
    }
    if ((coordinates[0] != null and coordinates[2] != null and coordinates[0].? > coordinates[2].?) or
        (coordinates[1] != null and coordinates[3] != null and coordinates[1].? > coordinates[3].?)) report.inverted_zones += 1;
    if ((rows != null and ((coordinates[0] != null and coordinates[0].? >= rows.?) or (coordinates[2] != null and coordinates[2].? >= rows.?))) or
        (cols != null and ((coordinates[1] != null and coordinates[1].? >= cols.?) or (coordinates[3] != null and coordinates[3].? >= cols.?)))) report.outside_grid += 1;
    const border_id: ?u32 = if (raw[4]) |present| try table_xml.unsigned(a, present, max_bytes) else null;
    if (border_id) |id| {
        report.border_zero += @intFromBool(id == 0);
        report.border_sum = std.math.add(u64, report.border_sum, id) catch return error.LimitExceeded;
    } else report.border_absent += 1;
    if (border_fills) |inventory| _ = id_references.noteValue(&report.border_references, border_id, inventory, tree.item_index);
}

/// Do not promote missing optional children to errors or invent default values.
pub fn inspectTable(a: std.mem.Allocator, tree: *const tree_mod.Tree, table: usize, rows: ?u32, cols: ?u32, max_bytes: usize, options: Options, border_fills: ?*const header_resources.Table, report: *Report) !void {
    report.tables += 1;
    var margin_count: usize = 0;
    var list_count: usize = 0;
    var child = tree.elements[table].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (table_xml.childIs(tree, index, "inMargin")) {
            if (report.in_margins == options.max_margin_elements) return error.LimitExceeded;
            report.in_margins += 1;
            margin_count += 1;
            try inspectMargin(a, tree, index, max_bytes, report);
        } else if (table_xml.childIs(tree, index, "cellzoneList")) {
            if (report.zone_lists == options.max_zone_lists) return error.LimitExceeded;
            report.zone_lists += 1;
            list_count += 1;
            var zone_count: usize = 0;
            var zone = tree.elements[index].first_child;
            while (zone) |zone_index| : (zone = tree.elements[zone_index].next_sibling) {
                if (table_xml.childIs(tree, zone_index, "cellzone")) {
                    zone_count += 1;
                    try inspectZone(a, tree, zone_index, rows, cols, max_bytes, options, border_fills, report);
                } else report.other_zone_list_children += 1;
            }
            report.empty_zone_lists += @intFromBool(zone_count == 0);
        }
    }
    report.missing_in_margin += @intFromBool(margin_count == 0);
    report.duplicate_in_margin += @intFromBool(margin_count > 1);
    report.missing_zone_list += @intFromBool(list_count == 0);
    report.duplicate_zone_list += @intFromBool(list_count > 1);
}
