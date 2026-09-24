const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const part_attrs = @import("xml_part_attributes.zig");
const table_xml = @import("table_xml_fields.zig");
const cell_fields = @import("table_cell_fields.zig");
const document_xml = @import("document_xml.zig");

/// Only direct row/cell topology. Existing field parsers own known child
/// cardinality and values; ordering is observed without being called invalid.
pub const Report = struct {
    rows: usize = 0,
    cells: usize = 0,
    row_other_attributes: usize = 0,
    row_other_direct: usize = 0,
    row_foreign_direct: usize = 0,
    cell_other_attributes: usize = 0,
    cell_other_direct: usize = 0,
    cell_foreign_direct: usize = 0,
    cell_known_direct: usize = 0,
    cell_first_known_sub_list: usize = 0,
    cell_last_known_address: usize = 0,
    observed_common_sequence: usize = 0,
    observed_address_last_sequence: usize = 0,
    other_known_sequence: usize = 0,
};

fn otherAttributes(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, known: []const []const u8) !usize {
    var tag = try part_attrs.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var other: usize = 0;
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var matched = false;
        if (name.prefix == null) {
            for (known) |candidate| {
                if (name.local.equals(candidate, false)) {
                    matched = true;
                    break;
                }
            }
        }
        other += @intFromBool(!matched);
    }
    return other;
}

/// The caller has already selected a direct hp:tr.
pub fn inspectRow(a: std.mem.Allocator, tree: *const tree_mod.Tree, row: usize, report: *Report) !void {
    report.rows += 1;
    report.row_other_attributes += try otherAttributes(a, tree, row, &.{});
    var cursor = tree.elements[row].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (table_xml.childIs(tree, index, "tc")) continue;
        report.row_other_direct += 1;
        report.row_foreign_direct += @intFromBool(!std.mem.eql(u8, tree.elements[index].name.uri, document_xml.paragraph_uri));
    }
}

/// The caller has already selected a direct hp:tc. The first/last counters
/// refer to recognized children only; unsupported direct elements remain visible.
pub fn inspectCell(a: std.mem.Allocator, tree: *const tree_mod.Tree, cell: usize, report: *Report) !void {
    report.cells += 1;
    report.cell_other_attributes += try otherAttributes(a, tree, cell, &cell_fields.cell_attribute_names);
    var first: ?usize = null;
    var last: ?usize = null;
    var known_sequence: [table_xml.cell_child_names.len]u8 = undefined;
    var known_count: usize = 0;
    var cursor = tree.elements[cell].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        var matched: ?usize = null;
        inline for (table_xml.cell_child_names, 0..) |name, child_index| {
            if (table_xml.childIs(tree, index, name)) matched = child_index;
        }
        if (matched) |kind| {
            report.cell_known_direct += 1;
            if (first == null) first = kind;
            last = kind;
            if (known_count < known_sequence.len) known_sequence[known_count] = @intCast(kind);
            known_count += 1;
        } else {
            report.cell_other_direct += 1;
            report.cell_foreign_direct += @intFromBool(!std.mem.eql(u8, tree.elements[index].name.uri, document_xml.paragraph_uri));
        }
    }
    report.cell_first_known_sub_list += @intFromBool(first == 4);
    report.cell_last_known_address += @intFromBool(last == 0);
    const common = known_count == known_sequence.len and std.mem.eql(u8, known_sequence[0..], &.{ 4, 0, 1, 2, 3 });
    const address_last = known_count == known_sequence.len and std.mem.eql(u8, known_sequence[0..], &.{ 4, 1, 2, 3, 0 });
    report.observed_common_sequence += @intFromBool(common);
    report.observed_address_last_sequence += @intFromBool(address_last);
    report.other_known_sequence += @intFromBool(!common and !address_last);
}
