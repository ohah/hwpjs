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
    const has_fields = try @import("source_field_analysis.zig").hasFields(self, section_index);
    if (!has_fields) return targets.toOwnedSlice(a);
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, self.sections.len);
    defer a.free(trees);
    for (self.sections, trees) |input, *tree| tree.* = input.tree;
    var analysis = try @import("source_field_analysis.zig").leaseForLabels(self, section_index);
    defer analysis.deinit(a);
    const report = analysis.source.report;
    const ranges = analysis.source.fields;
    const frames = try @import("xml_tree_selection.zig").build(a, &section.tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    if (section.structure_values) |*current| {
        var materialized = false;
        for (current.paragraphs) |row| if (row.field_positions != null) {
            materialized = true;
        };
        if (materialized) {
            if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
            const spans = try @import("field_current_spans.zig").build(a, trees, section_index, current, &report, 200_000);
            defer a.free(spans);
            for (spans) |span| {
                if (span.paragraph_index != paragraph - section.first_paragraph) continue;
                const field = chosen: {
                    for (ranges) |range| if (range.section == section_index and report.markers[range.begin_marker].element_index == span.begin_element) break :chosen range;
                    return error.InvalidFieldLinks;
                };
                @import("field_label_session.zig").validateLinked(&section.tree, field, &report, ranges, frames) catch |err| switch (err) {
                    error.UnsupportedFieldLabel => continue,
                    else => return err,
                };
                if (targets.items.len >= max_targets) return error.LimitExceeded;
                try targets.append(a, .{ .begin_element = std.math.cast(u32, span.begin_element) orelse return error.LimitExceeded, .start = std.math.cast(u32, span.start) orelse return error.LimitExceeded, .end = std.math.cast(u32, span.end) orelse return error.LimitExceeded });
            }
            return targets.toOwnedSlice(a);
        }
    }
    for (ranges) |range| {
        if (range.section != section_index) continue;
        const index = report.markers[range.begin_marker].element_index;
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
