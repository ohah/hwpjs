//! Source interval relationships, independent of text widths and field names.
const Range = @import("field_text_ranges.zig").Range;
const std = @import("std");
pub const Relation = enum { same, disjoint, ancestor, descendant };

pub fn validateNestedScope(tree: *const @import("xml_part_tree.zig").Tree, selected: Range, other: Range, report: *const @import("field_markers.zig").Report) !void {
    const kind = try relation(selected, other);
    if (kind != .ancestor and kind != .descendant) return;
    var owner: ?usize = null;
    for ([_]Range{ selected, other }, 0..) |field, ordinal| {
        if (field.begin_marker >= report.markers.len or field.end_marker >= report.markers.len) return error.SourceBindingMismatch;
        const begin = report.markers[field.begin_marker].element_index;
        const end = report.markers[field.end_marker].element_index;
        if (end >= tree.elements.len) return error.SourceBindingMismatch;
        const scope = try @import("field_source_scope.zig").forBegin(tree, begin);
        if (!scope.contains(tree.elements[end].start_tag.start)) return error.UnsupportedNestedFieldLabel;
        if (ordinal == 0) owner = scope.owner else if (owner != scope.owner) return error.UnsupportedNestedFieldLabel;
    }
}

pub fn descendantSpans(a: std.mem.Allocator, selected: Range, ranges: []const Range, segments: []const @import("paragraph_text_positions.zig").Segment, report: *const @import("field_markers.zig").Report) ![]@import("field_current_spans.zig").Span {
    var spans: std.ArrayList(@import("field_current_spans.zig").Span) = .empty;
    defer spans.deinit(a);
    for (ranges) |other| {
        if (try relation(selected, other) != .ancestor) continue;
        if (@import("field_text_positions.zig").project(other, selected.section, segments)) |span| {
            if (other.begin_marker >= report.markers.len) return error.SourceBindingMismatch;
            try spans.append(a, .{ .begin_element = report.markers[other.begin_marker].element_index, .paragraph_index = 0, .start = span.start_unit, .end = span.end_unit });
        }
    }
    return spans.toOwnedSlice(a);
}

/// Only a validated descendant marker's own metadata subtree is opaque here.
pub fn retainedDescendantMarker(tree: *const @import("xml_part_tree.zig").Tree, index: usize, selected: Range, ranges: []const Range, report: *const @import("field_markers.zig").Report) !bool {
    if (index >= tree.elements.len) return error.SourceBindingMismatch;
    const offset = tree.elements[index].start_tag.start;
    for (ranges) |other| {
        if (try relation(selected, other) != .ancestor) continue;
        if (other.begin_marker >= report.markers.len or other.end_marker >= report.markers.len) return error.SourceBindingMismatch;
        const marker = report.markers[other.begin_marker];
        if (!@import("field_text_kind.zig").supported(marker.begin.?.type_raw orelse "") or marker.unexpected_children != 0 or marker.sub_list_children != 0) return error.UnsupportedNestedFieldLabel;
        for ([_]usize{ marker.element_index, report.markers[other.end_marker].element_index }) |element_index| {
            if (element_index >= tree.elements.len) return error.SourceBindingMismatch;
            const element = tree.elements[element_index];
            if (element.start_tag.start <= offset and offset < element.end) return true;
        }
    }
    return false;
}

/// Prepare affected dirty metadata before any string transaction commits.
/// Returns source element IDs for the selected field and every ancestor.
pub fn dirtyOwners(a: std.mem.Allocator, selected: Range, ranges: []const Range, report: *const @import("field_markers.zig").Report, max_owners: usize) ![]usize {
    var owners: std.ArrayList(usize) = .empty;
    defer owners.deinit(a);
    var found_selected = false;
    for (ranges) |other| {
        const kind = try relation(selected, other);
        if (kind != .same and kind != .descendant) continue;
        if (other.begin_marker >= report.markers.len) return error.SourceBindingMismatch;
        const marker = report.markers[other.begin_marker];
        const begin = marker.begin orelse return error.InvalidFieldLinks;
        if (!@import("field_text_kind.zig").supported(begin.type_raw orelse "") or marker.unexpected_children != 0 or marker.sub_list_children != 0) return error.UnsupportedNestedFieldLabel;
        if (kind == .same) {
            if (found_selected) return error.SourceBindingMismatch;
            found_selected = true;
        }
        if (owners.items.len >= max_owners) return error.LimitExceeded;
        try owners.append(a, marker.element_index);
    }
    if (!found_selected) return error.InvalidFieldElement;
    return owners.toOwnedSlice(a);
}

pub fn relation(selected: Range, other: Range) !Relation {
    if (selected.content_end < selected.content_start or other.content_end < other.content_start) return error.InvalidFieldSpan;
    if (selected.section != other.section) return .disjoint;
    if (selected.begin_marker == other.begin_marker) {
        if (selected.end_marker != other.end_marker or selected.content_start != other.content_start or selected.content_end != other.content_end) return error.SourceBindingMismatch;
        return .same;
    }
    if (selected.content_end <= other.content_start or other.content_end <= selected.content_start) return .disjoint;
    if (selected.content_start < other.content_start and other.content_end < selected.content_end) return .ancestor;
    if (other.content_start < selected.content_start and selected.content_end < other.content_end) return .descendant;
    // Coincident/crossing source bounds do not prove a nested marker graph.
    return error.UnsupportedNestedFieldLabel;
}

test "nested field source ownership distinguishes containment from crossing and identity" {
    const outer: Range = .{ .section = 0, .begin_marker = 0, .end_marker = 3, .content_start = 10, .content_end = 100 };
    const inner: Range = .{ .section = 0, .begin_marker = 1, .end_marker = 2, .content_start = 20, .content_end = 90 };
    try std.testing.expectEqual(Relation.same, try relation(outer, outer));
    try std.testing.expectEqual(Relation.ancestor, try relation(outer, inner));
    try std.testing.expectEqual(Relation.descendant, try relation(inner, outer));
    var other = inner;
    other.section = 1;
    try std.testing.expectEqual(Relation.disjoint, try relation(outer, other));
    other = inner;
    other.content_start = outer.content_end;
    other.content_end = 120;
    try std.testing.expectEqual(Relation.disjoint, try relation(outer, other));
    other.content_start = 90;
    try std.testing.expectError(error.UnsupportedNestedFieldLabel, relation(outer, other));
    other = inner;
    other.content_start = outer.content_start;
    other.content_end = outer.content_end;
    try std.testing.expectError(error.UnsupportedNestedFieldLabel, relation(outer, other));
    other = outer;
    other.end_marker += 1;
    try std.testing.expectError(error.SourceBindingMismatch, relation(outer, other));
    other = inner;
    other.content_end = other.content_start - 1;
    try std.testing.expectError(error.InvalidFieldSpan, relation(outer, other));
}

test "nested field scope rejects a root field enclosing a different text list" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE'/></p:ctrl><p:t>outer</p:t></p:run></p:p><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='2' type='CLICK_HERE'/></p:ctrl><p:t>inner</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p></p:subList><p:p><p:run><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &report);
    defer a.free(ranges);
    try std.testing.expectEqual(@as(usize, 2), ranges.len);
    try std.testing.expectError(error.UnsupportedNestedFieldLabel, validateNestedScope(&tree, ranges[0], ranges[1], &report));
    try std.testing.expectError(error.UnsupportedNestedFieldLabel, validateNestedScope(&tree, ranges[1], ranges[0], &report));
}
