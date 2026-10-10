//! 현재 필드 문단 입력과 dirty 상태를 원자적으로 게시합니다.
const std = @import("std");

pub fn splice(self: anytype, section_index: usize, paragraph: usize, begin_element: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
    const a = self.allocator;
    const selected = &self.sections[section_index];
    const descriptors = try @import("field_label_targets.zig").list(self, section_index, paragraph, 4096);
    defer a.free(descriptors);
    const target = find_target: {
        for (descriptors) |descriptor| if (descriptor.begin_element == begin_element) break :find_target descriptor;
        return error.InvalidFieldElement;
    };
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, self.sections.len);
    defer a.free(trees);
    for (self.sections, trees) |section, *tree| tree.* = section.tree;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, trees, &report);
    defer a.free(ranges);
    const field = find_field: {
        for (ranges) |range| if (range.section == section_index and report.markers[range.begin_marker].element_index == begin_element) break :find_field range;
        return error.InvalidFieldElement;
    };
    const current = &selected.structure_values.?;
    const index = paragraph - selected.first_paragraph;
    var other_bytes: usize = 0;
    for (self.sections, 0..) |section, ordinal| {
        if (ordinal != section_index) other_bytes += try section.textBytes(self.options.max_text_bytes -| other_bytes);
    }
    for (current.paragraphs, 0..) |row, ordinal| {
        if (ordinal == index) continue;
        for (row.sites.items) |site| {
            if (site.text.len > self.options.max_text_bytes -| other_bytes) return error.LimitExceeded;
            other_bytes += site.text.len;
        }
    }
    var candidate = try current.clone(a);
    defer candidate.deinit(a);
    const edited = (try @import("field_label_splice.zig").prepareOwned(a, &selected.tree, &candidate.paragraphs[index], field, section_index, .{ .start_unit = target.start, .end_unit = target.end }, start, deleted, inserted, self.options.max_text_bytes -| other_bytes)) orelse return false;
    candidate.paragraphs[index].deinit(a);
    candidate.paragraphs[index] = edited;
    const spans = try @import("field_current_spans.zig").build(a, trees, section_index, &candidate, &report, 200_000);
    defer a.free(spans);
    var dirty_index: ?usize = null;
    for (selected.field_dirty.items, 0..) |value, ordinal| if (value.element_index == begin_element) {
        dirty_index = ordinal;
    };
    if (dirty_index == null) try selected.field_dirty.ensureUnusedCapacity(a, 1);
    std.mem.swap(@TypeOf(candidate), current, &candidate);
    if (dirty_index) |ordinal| selected.field_dirty.items[ordinal].dirty = true else selected.field_dirty.appendAssumeCapacity(.{ .element_index = begin_element, .dirty = true });
    return true;
}
