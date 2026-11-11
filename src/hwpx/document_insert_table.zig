//! Closed, reference-bearing subset of native hp:tbl source XML.
//! Grid/placement validation delegates to the existing table readers.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const patch = @import("document_insert_xml.zig");
const fields = @import("table_xml_fields.zig");
const hp = @import("document_xml.zig").paragraph_uri;

pub fn read(a: std.mem.Allocator, tree: *const Tree, table: usize, paragraph_budget: usize) ![]const usize {
    var tag = try patch.tagWithNamespace(a, tree, table, &.{
        "id",        "zOrder",       "numberingType", "textWrap", "textFlow",    "lock",            "dropcapstyle",
        "pageBreak", "repeatHeader", "rowCnt",        "colCnt",   "cellSpacing", "borderFillIDRef", "noAdjust",
    }, hp);
    tag.deinit(a);
    _ = try patch.number(a, tree, table, "id");
    _ = try patch.number(a, tree, table, "borderFillIDRef");
    try optionalFalse(a, tree, table, "lock");
    try optionalValue(a, tree, table, "numberingType", "TABLE");
    var paragraphs: std.ArrayList(usize) = .empty;
    const Child = enum { size, position, out_margin, in_margin, zones };
    var seen: std.EnumSet(Child) = .{};
    var child = tree.elements[table].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        const element = tree.elements[node];
        if (element.is(hp, "tr")) {
            try plainTag(a, tree, node, &.{});
            var cell = element.first_child;
            while (cell) |c| : (cell = tree.elements[c].next_sibling) {
                if (!tree.elements[c].is(hp, "tc")) return error.UnsupportedInsertTable;
                try readCell(a, tree, c, &paragraphs, paragraph_budget);
            }
            continue;
        }
        const kind: Child = if (element.is(hp, "sz")) .size else if (element.is(hp, "pos")) .position else if (element.is(hp, "outMargin")) .out_margin else if (element.is(hp, "inMargin")) .in_margin else if (element.is(hp, "cellzoneList")) .zones else return error.UnsupportedInsertTable;
        if (seen.contains(kind)) return error.InvalidInsertTable;
        seen.insert(kind);
        switch (kind) {
            .size => {
                try leaf(a, tree, node, &.{ "width", "widthRelTo", "height", "heightRelTo", "protect" });
                try optionalFalse(a, tree, node, "protect");
            },
            .position => try leaf(a, tree, node, &.{
                "treatAsChar", "affectLSpacing", "flowWithText", "allowOverlap", "holdAnchorAndSO",
                "vertRelTo",   "horzRelTo",      "vertAlign",    "horzAlign",    "vertOffset",
                "horzOffset",
            }),
            .out_margin, .in_margin => try leaf(a, tree, node, &fields.margin_names),
            .zones => {
                try plainTag(a, tree, node, &.{});
                var zone = element.first_child;
                while (zone) |z| : (zone = tree.elements[z].next_sibling) {
                    if (!tree.elements[z].is(hp, "cellzone")) return error.UnsupportedInsertTable;
                    try leaf(a, tree, z, &.{ "startRowAddr", "startColAddr", "endRowAddr", "endColAddr", "borderFillIDRef" });
                    _ = try patch.number(a, tree, z, "borderFillIDRef");
                }
            },
        }
    }
    const placement = try @import("table_geometry_values.zig").read(a, tree, table);
    if (placement.geometry.treat_as_character != true or placement.allow_overlap == true or placement.hold_anchor == true)
        return error.UnsupportedInsertTablePlacement;
    if ((placement.geometry.width orelse 0) == 0 or (placement.geometry.height orelse 0) == 0 or
        paragraphs.items.len == 0)
        return error.InvalidInsertTable;
    return paragraphs.items;
}

fn readCell(a: std.mem.Allocator, tree: *const Tree, index: usize, paragraphs: *std.ArrayList(usize), limit: usize) !void {
    try plainTag(a, tree, index, &fields_cell.cell_attribute_names);
    _ = try patch.number(a, tree, index, "borderFillIDRef");
    try optionalFalse(a, tree, index, "protect");
    try optionalValue(a, tree, index, "name", "");
    var list: ?usize = null;
    var child = tree.elements[index].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        const element = tree.elements[node];
        if (element.is(hp, "subList")) {
            if (list != null) return error.InvalidInsertTable;
            list = node;
            try plainTag(a, tree, node, &.{
                "id",                "textDirection", "lineWrap",   "vertAlign",  "linkListIDRef",
                "linkListNextIDRef", "textWidth",     "textHeight", "hasTextRef", "hasNumRef",
            });
            if (try tree.attributeValue(a, node, "", "id")) |raw| {
                const id = try raw.toUtf8(a, 64);
                defer a.free(id);
                if (id.len != 0 and !std.mem.eql(u8, id, "0")) return error.UnsupportedInsertTable;
            }
            for ([_][]const u8{ "linkListIDRef", "linkListNextIDRef" }) |name|
                try optionalValue(a, tree, node, name, "0");
            for ([_][]const u8{ "hasTextRef", "hasNumRef" }) |name|
                try optionalFalse(a, tree, node, name);
            var paragraph = element.first_child orelse return error.InvalidInsertTable;
            while (true) {
                if (!tree.elements[paragraph].is(hp, "p")) return error.UnsupportedInsertTable;
                if (paragraphs.items.len == limit) return error.LimitExceeded;
                try paragraphs.append(a, paragraph);
                paragraph = tree.elements[paragraph].next_sibling orelse break;
            }
        } else if (element.is(hp, "cellAddr")) {
            try leaf(a, tree, node, &.{ "rowAddr", "colAddr" });
        } else if (element.is(hp, "cellSpan")) {
            try leaf(a, tree, node, &.{ "rowSpan", "colSpan" });
        } else if (element.is(hp, "cellSz")) {
            try leaf(a, tree, node, &fields_cell.size_names);
        } else if (element.is(hp, "cellMargin")) {
            try leaf(a, tree, node, &fields.margin_names);
        } else return error.UnsupportedInsertTable;
    }
    if (list == null) return error.InvalidInsertTable;
}

const fields_cell = @import("table_cell_fields.zig");
fn plainTag(a: std.mem.Allocator, tree: *const Tree, index: usize, attrs: []const []const u8) !void {
    var tag = try patch.tag(a, tree, index, attrs);
    tag.deinit(a);
}
fn leaf(a: std.mem.Allocator, tree: *const Tree, index: usize, attrs: []const []const u8) !void {
    if (tree.elements[index].first_child != null) return error.UnsupportedInsertTable;
    try plainTag(a, tree, index, attrs);
}
fn optionalFalse(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8) !void {
    if (try tree.attributeValue(a, index, "", name)) |raw| {
        if (try fields.boolean(a, raw, 32)) return error.UnsupportedInsertTable;
    }
}
fn optionalValue(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8, expected: []const u8) !void {
    if ((try tree.attributeValue(a, index, "", name)) != null)
        try patch.requireValue(a, tree, index, name, expected);
}

pub fn validateDocument(a: std.mem.Allocator, tree: *const Tree, header: *const @import("header_resources.zig").Report) !void {
    const report = try @import("table_geometry.zig").inspectWithBorderFills(a, &.{tree.*}, .{}, header.table(.border_fill));
    if (!report.table_attributes.border_fill_references.allPresentResolved() or
        !report.cell_fields.border_fill_references.allPresentResolved() or
        !report.table_children.border_references.allPresentResolved()) return error.UnresolvedInsertReference;
    if (report.missing_row_count != 0 or report.missing_column_count != 0 or report.row_count_mismatch != 0 or
        report.empty_rows != 0 or report.missing_address != 0 or report.duplicate_address != 0 or
        report.missing_span != 0 or report.duplicate_span != 0 or report.missing_coordinate != 0 or
        report.missing_span_value != 0 or report.row_address_mismatch != 0 or report.zero_span != 0 or
        report.outside_grid != 0 or report.overlaps != 0 or report.uncovered_slots != 0 or
        report.cell_fields.missing_size != 0 or report.cell_fields.duplicate_size != 0 or
        report.cell_fields.duplicate_margin != 0 or report.cell_fields.true_without_margin != 0 or
        report.table_children.inverted_zones != 0 or
        report.table_children.outside_grid != 0 or report.cell_sub_lists.unknown_enums != 0)
        return error.InvalidInsertTable;
    for (report.table_children.coordinate_absent) |missing| {
        if (missing != 0) return error.InvalidInsertTable;
    }
    for (report.cell_fields.missing_size_field, report.cell_fields.zero_size_field) |missing, zero| {
        if (missing != 0 or zero != 0) return error.InvalidInsertTable;
    }
    for (report.table_children.coordinate_absent) |missing| if (missing != 0) return error.InvalidInsertTable;
}
