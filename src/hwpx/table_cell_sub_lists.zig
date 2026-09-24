const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");
const para_list = @import("para_list_attributes.zig");
const values = @import("xml_values.zig");

pub const Options = struct {
    max_sub_lists: usize = 4_000_000,
    max_direct_paragraphs: usize = 4_000_000,
};

/// Observations of hp:tc's direct hp:subList children. The section-wide
/// paragraph/run inspectors retain responsibility for nested scalar fields.
pub const Report = struct {
    cells: usize = 0,
    sub_lists: usize = 0,
    missing_cells: usize = 0,
    duplicate_cells: usize = 0,
    /// No direct element children; literal character data may still exist.
    empty_sub_lists: usize = 0,
    direct_paragraphs: usize = 0,
    other_direct_elements: usize = 0,
    field_present: [para_list.field_names.len]usize = @splat(0),
    field_empty: [para_list.field_names.len]usize = @splat(0),
    unknown_enums: usize = 0,
    other_attributes: usize = 0,
    text_width_sum: u64 = 0,
    text_height_sum: u64 = 0,
    has_text_ref_true: usize = 0,
    has_num_ref_true: usize = 0,
};

fn noteAttributes(report: *Report, attrs: *const para_list.Attributes) !void {
    report.unknown_enums += attrs.unknown_enums;
    report.other_attributes += attrs.other_attributes;
    for (attrs.raw, 0..) |raw, index| if (raw) |value| {
        report.field_present[index] += 1;
        report.field_empty[index] += @intFromBool(value.len == 0);
    };
    if (attrs.get(.text_width)) |raw| {
        const value = try values.unsigned32(raw);
        report.text_width_sum = std.math.add(u64, report.text_width_sum, value) catch return error.LimitExceeded;
    }
    if (attrs.get(.text_height)) |raw| {
        const value = try values.unsigned32(raw);
        report.text_height_sum = std.math.add(u64, report.text_height_sum, value) catch return error.LimitExceeded;
    }
    if (attrs.get(.has_text_ref)) |raw| report.has_text_ref_true += @intFromBool(try values.boolean(raw));
    if (attrs.get(.has_num_ref)) |raw| report.has_num_ref_true += @intFromBool(try values.boolean(raw));
}

/// The caller already selected a direct hp:tc. Only direct hp:subList is
/// counted; a nested table or foreign namespace cannot satisfy this slot.
pub fn inspectCell(a: std.mem.Allocator, tree: *const tree_mod.Tree, cell: usize, max_attribute_bytes: usize, options: Options, report: *Report) !void {
    report.cells += 1;
    var in_cell: usize = 0;
    var cursor = tree.elements[cell].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (!table_xml.childIs(tree, index, "subList")) continue;
        if (report.sub_lists == options.max_sub_lists) return error.LimitExceeded;
        report.sub_lists += 1;
        in_cell += 1;
        var attrs = try para_list.readTree(a, tree, index, max_attribute_bytes);
        defer attrs.deinit(a);
        try noteAttributes(report, &attrs);
        var direct_children: usize = 0;
        var child = tree.elements[index].first_child;
        while (child) |child_index| : (child = tree.elements[child_index].next_sibling) {
            direct_children += 1;
            if (table_xml.childIs(tree, child_index, "p")) {
                if (report.direct_paragraphs == options.max_direct_paragraphs) return error.LimitExceeded;
                report.direct_paragraphs += 1;
            } else report.other_direct_elements += 1;
        }
        report.empty_sub_lists += @intFromBool(direct_children == 0);
    }
    report.missing_cells += @intFromBool(in_cell == 0);
    report.duplicate_cells += @intFromBool(in_cell > 1);
}
