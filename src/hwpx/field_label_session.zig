const std = @import("std");
const tree_module = @import("xml_part_tree.zig");

pub const Prepared = struct {
    field: @import("field_text_ranges.zig").Range,
    segments: []@import("paragraph_text_positions.zig").Segment,
    pub fn deinit(self: Prepared, a: std.mem.Allocator) void {
        a.free(self.segments);
    }
};

/// Shared validation and current positions for queries and mutations.
pub fn prepare(self: anytype, section_index: usize, paragraph: usize, begin_element: usize) !Prepared {
    if (section_index >= self.sections.len) return error.InvalidSectionIndex;
    const selected = &self.sections[section_index];
    if (paragraph < selected.first_paragraph or paragraph > selected.last_paragraph) return error.InvalidParagraphIndex;
    const a = self.allocator;
    const trees = try a.alloc(tree_module.Tree, self.sections.len);
    defer a.free(trees);
    for (self.sections, trees) |section, *tree| tree.* = section.tree;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, trees, &report);
    defer a.free(ranges);
    const frames = try @import("xml_tree_selection.zig").build(a, &selected.tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    return prepareLinked(self, section_index, paragraph, begin_element, &report, ranges, frames);
}

/// Reuse one immutable report/range snapshot across a descriptor query.
pub fn prepareLinked(self: anytype, section_index: usize, paragraph: usize, begin_element: usize, report: *const @import("field_markers.zig").Report, ranges: []const @import("field_text_ranges.zig").Range, frames: []const @import("xml_tree_selection.zig").Frame) !Prepared {
    if (section_index >= self.sections.len) return error.InvalidSectionIndex;
    const selected = &self.sections[section_index];
    if (paragraph < selected.first_paragraph or paragraph > selected.last_paragraph) return error.InvalidParagraphIndex;
    const a = self.allocator;
    const field = find_field: {
        for (ranges) |range| {
            if (range.section == section_index and report.markers[range.begin_marker].element_index == begin_element) break :find_field range;
        }
        return error.InvalidFieldElement;
    };
    const begin = report.markers[field.begin_marker];
    for (ranges) |other| {
        if (other.section != field.section or other.begin_marker == field.begin_marker) continue;
        if (other.content_start < field.content_end and field.content_start < other.content_end) return error.UnsupportedNestedFieldLabel;
    }
    const uri = @import("document_xml.zig").paragraph_uri;
    for (selected.tree.elements, 0..) |element, index| {
        if (element.start_tag.start < field.content_start or element.start_tag.start >= field.content_end) continue;
        if (element.is(uri, "p") or element.is(uri, "run") or element.is(uri, "t") or element.is(uri, "ctrl") or element.is(uri, "linesegarray") or element.is(uri, "lineseg")) continue;
        if (@import("retained_tab.zig").supported(&selected.tree, index)) continue;
        return error.UnsupportedFieldLabelContent;
    }
    const kind = begin.begin.?.type_raw orelse return error.UnsupportedFieldLabel;
    if (!std.mem.eql(u8, kind, "HYPERLINK") and !std.mem.eql(u8, kind, "CLICK_HERE")) return error.UnsupportedFieldLabel;
    if (begin.unexpected_children != 0 or begin.sub_list_children != 0) return error.UnsupportedFieldLabel;
    _ = try @import("field_marker_ownership.zig").paragraph(&selected.tree, frames, begin_element);
    _ = try @import("field_marker_ownership.zig").paragraph(&selected.tree, frames, report.markers[field.end_marker].element_index);
    const segments = try @import("paragraph_text_positions.zig").build(a, &selected.tree, &selected.sites, selected.locations, paragraph);
    return .{ .field = field, .segments = segments };
}

/// Explicit label command, not permission to flatten arbitrary controls.
pub fn splice(self: anytype, section_index: usize, paragraph: usize, begin_element: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
    const prepared = try prepare(self, section_index, paragraph, begin_element);
    defer prepared.deinit(self.allocator);
    const field = prepared.field;
    const segments = prepared.segments;
    const a = self.allocator;
    const selected = &self.sections[section_index];
    var other_bytes: usize = 0;
    for (self.sections, 0..) |section, index| {
        if (index == section_index) continue;
        for (section.sites.items) |site| {
            if (site.text.len > self.options.max_text_bytes -| other_bytes) return error.LimitExceeded;
            other_bytes += site.text.len;
        }
    }
    var dirty_index: ?usize = null;
    for (selected.field_dirty.items, 0..) |value, index| {
        if (value.element_index == begin_element) dirty_index = index;
    }
    // Prepare metadata capacity before committing strings: no fallible
    // operation may follow a successful splice.
    if (dirty_index == null) try selected.field_dirty.ensureUnusedCapacity(a, 1);
    const changed = try @import("field_label_splice.zig").splice(a, &selected.sites, segments, field, section_index, start, deleted, inserted, self.options.max_text_bytes - other_bytes);
    if (changed) {
        if (dirty_index) |index| selected.field_dirty.items[index].dirty = true else selected.field_dirty.appendAssumeCapacity(.{ .element_index = begin_element, .dirty = true });
    }
    return changed;
}
