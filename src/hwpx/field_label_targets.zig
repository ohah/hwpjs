//! Current paragraph label descriptors, derived with the command's policy.
const std = @import("std");
pub const Target = struct { begin_element: u32, start: u32, end: u32 };

pub fn list(self: anytype, section_index: usize, paragraph: usize, max_targets: usize) ![]Target {
    if (section_index >= self.sections.len) return error.InvalidSectionIndex;
    const section = &self.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    const a = self.allocator;
    var targets: std.ArrayList(Target) = .empty;
    defer targets.deinit(a);
    const has_fields = has: {
        for (section.tree.elements) |element| {
            if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break :has true;
        }
        break :has false;
    };
    if (!has_fields) return targets.toOwnedSlice(a);
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, self.sections.len);
    defer a.free(trees);
    for (self.sections, trees) |input, *tree| tree.* = input.tree;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, trees, &report);
    defer a.free(ranges);
    const frames = try @import("xml_tree_selection.zig").build(a, &section.tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    for (section.tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        const prepared = @import("field_label_session.zig").prepareLinked(self, section_index, paragraph, index, &report, ranges, frames) catch |err| switch (err) {
            error.UnsupportedFieldLabel, error.UnsupportedNestedFieldLabel, error.UnsupportedFieldLabelContent, error.UnsupportedFieldOwnership, error.MissingTextSite, error.UnsupportedInlineControl => continue,
            else => return err,
        };
        defer prepared.deinit(a);
        const span = @import("field_text_positions.zig").project(prepared.field, section_index, prepared.segments) orelse continue;
        if (targets.items.len == max_targets) return error.LimitExceeded;
        try targets.append(a, .{ .begin_element = @intCast(index), .start = @intCast(span.start_unit), .end = @intCast(span.end_unit) });
    }
    return targets.toOwnedSlice(a);
}
