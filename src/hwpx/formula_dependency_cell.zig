//! Identify an entire derived cell without trusting its cached display text.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const fields = @import("table_xml_fields.zig");

fn nearestCell(tree: *const Tree, node: usize) ?usize {
    var cursor = tree.elements[node].parent;
    while (cursor) |index| : (cursor = tree.elements[index].parent) {
        if (fields.childIs(tree, index, "tc")) return index;
    }
    return null;
}

/// Linked ranges belong to this unchanged tree; null means use the plain reader.
pub fn marker(tree: *const Tree, sites: *const Sites, cell: usize, ranges: []const @import("field_text_ranges.zig").Range, report: *const @import("field_markers.zig").Report) !?usize {
    return markerSelected(tree, sites, cell, ranges, report, null);
}

pub fn markerSelected(tree: *const Tree, sites: *const Sites, cell: usize, ranges: []const @import("field_text_ranges.zig").Range, report: *const @import("field_markers.zig").Report, frames: ?[]const @import("xml_tree_selection.zig").Frame) !?usize {
    if (frames) |selection| if (selection.len != tree.elements.len) return error.SourceBindingMismatch;
    if (cell >= tree.elements.len or !fields.childIs(tree, cell, "tc")) return error.InvalidFormulaCellOwner;
    var selected: ?@import("field_text_ranges.zig").Range = null;
    var begin: ?usize = null;
    var end: ?usize = null;
    for (ranges) |range| {
        if (range.section != tree.section_ordinal) continue;
        if (range.begin_marker >= report.markers.len or range.end_marker >= report.markers.len) return error.InvalidFieldLinks;
        const first = report.markers[range.begin_marker];
        const last = report.markers[range.end_marker];
        if (first.element_index >= tree.elements.len or last.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        if (nearestCell(tree, first.element_index) != cell) continue;
        if (frames) |selection| {
            if (!selection[first.element_index].active and !selection[last.element_index].active) continue;
            if (selection[first.element_index].active != selection[last.element_index].active) return error.InvalidFormulaBranchOwnership;
        }
        const values = first.begin orelse return error.InvalidFieldLinks;
        if (values.type_raw == null or !std.mem.eql(u8, values.type_raw.?, "FORMULA")) return error.UnsupportedFormulaCellContent;
        if (selected != null) return error.AmbiguousFormulaCell;
        if (nearestCell(tree, last.element_index) != cell or tree.elements[first.element_index].end != range.content_start or tree.elements[last.element_index].start_tag.start != range.content_end) return error.SourceBindingMismatch;
        selected = range;
        begin = first.element_index;
        end = last.element_index;
    }
    const range = selected orelse return null;
    var paragraphs: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (frames) |selection| if (!selection[node].active) continue;
        if (nearestCell(tree, node) != cell) continue;
        if (fields.childIs(tree, node, "p")) {
            paragraphs += 1;
            if (paragraphs > 1) return error.UnsupportedFormulaCellParagraphs;
        }
        if (node >= begin.? and element.start_tag.start < tree.elements[begin.?].end) continue;
        if (node == end.?) continue;
        if (fields.childIs(tree, node, "ctrl")) {
            var child = element.first_child;
            var linked = false;
            while (child) |index| : (child = tree.elements[index].next_sibling) {
                if (index != begin.? and index != end.?) return error.UnsupportedFormulaCellContent;
                linked = true;
            }
            if (!linked) return error.UnsupportedFormulaCellContent;
        }
        var cursor = element.parent;
        var in_paragraph = false;
        while (cursor) |index| : (cursor = tree.elements[index].parent) {
            if (fields.childIs(tree, index, "tc")) break;
            if (fields.childIs(tree, index, "p")) in_paragraph = true;
        }
        const selected_wrapper = if (frames) |selection| selection[node].kind == .switch_element or selection[node].kind == .branch else false;
        if (in_paragraph and !selected_wrapper and !fields.childIs(tree, node, "run") and !fields.childIs(tree, node, "t") and !fields.childIs(tree, node, "ctrl") and !fields.childIs(tree, node, "linesegarray") and !fields.childIs(tree, node, "lineseg")) return error.UnsupportedFormulaCellContent;
    }
    for (sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        if (frames) |selection| if (!selection[site.element_index].active) continue;
        if (nearestCell(tree, site.element_index) != cell) continue;
        const element = tree.elements[site.element_index];
        if (element.start_tag.start >= range.content_start and element.end <= range.content_end) continue;
        if (site.text.len != 0) return error.UnsupportedFormulaCellContent;
    }
    return begin;
}

test "HWPX derived cell classifier ignores display cache and refuses surrounding content" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const boundary = std.mem.indexOf(u8, fixture, "<p:ctrl><p:fieldBegin").?;
    for ([_][]const u8{ "", "<p:t>extra</p:t>", "<p:ctrl><p:bookmark/></p:ctrl>", "<p:ctrl/>" }, 0..) |extra, index| {
        const source = try std.mem.concat(a, u8, &.{ fixture[0..boundary], extra, fixture[boundary..] });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        var report = try @import("field_markers.zig").inspect(a, &.{tree}, .{});
        defer report.deinit();
        const ranges = try @import("field_text_ranges.zig").build(a, &.{tree}, &report);
        defer a.free(ranges);
        const begin = report.markers[ranges[0].begin_marker].element_index;
        const owner = try @import("formula_cell_owner.zig").read(a, &tree, begin);
        if (index == 0) {
            a.free(sites.items[sites.items.len - 1].text);
            sites.items[sites.items.len - 1].text = try a.dupe(u8, "stale cache");
            try std.testing.expectEqual(begin, (try marker(&tree, &sites, owner.cell, ranges, &report)).?);
        } else try std.testing.expectError(error.UnsupportedFormulaCellContent, marker(&tree, &sites, owner.cell, ranges, &report));
    }
}

test "HWPX derived cell classifier excludes inactive branches but checks active content" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const boundary = std.mem.indexOf(u8, fixture, "<p:ctrl><p:fieldBegin").?;
    for ([_][]const u8{ "", "<p:t>active extra</p:t>" }, 0..) |active, index| {
        const source = try std.mem.concat(a, u8, &.{ fixture[0..boundary], "<p:switch><p:case><p:t>inactive extra</p:t><p:ctrl><p:bookmark/></p:ctrl></p:case><p:default>", active, "</p:default></p:switch>", fixture[boundary..] });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        var report = try @import("field_markers.zig").inspect(a, &.{tree}, .{});
        defer report.deinit();
        const ranges = try @import("field_text_ranges.zig").build(a, &.{tree}, &report);
        defer a.free(ranges);
        const frames = try @import("xml_tree_selection.zig").build(a, &tree, .{ .mode = .selected }, 4096);
        defer a.free(frames);
        const begin = report.markers[ranges[0].begin_marker].element_index;
        const owner = try @import("formula_cell_owner.zig").read(a, &tree, begin);
        if (index == 0) {
            try std.testing.expectEqual(begin, (try markerSelected(&tree, &sites, owner.cell, ranges, &report, frames)).?);
            try std.testing.expectError(error.SourceBindingMismatch, markerSelected(&tree, &sites, owner.cell, ranges, &report, frames[0 .. frames.len - 1]));
        } else try std.testing.expectError(error.UnsupportedFormulaCellContent, markerSelected(&tree, &sites, owner.cell, ranges, &report, frames));
    }
}
