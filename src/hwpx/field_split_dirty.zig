//! 분할 선택 삭제가 실제 라벨 범위를 변경할 때만 dirty 후보를 만듭니다.
const std = @import("std");
const Dirty = @import("text_sites_save.zig").FieldDirty;

pub fn prepare(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *const @import("paragraph_structure_values.zig").Values, index: usize, start: u32, end: u32, previous: []const Dirty) !std.ArrayList(Dirty) {
    var result: std.ArrayList(Dirty) = .empty;
    errdefer result.deinit(a);
    try result.appendSlice(a, previous);
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const spans = try @import("field_current_spans.zig").build(a, trees, section, current, &report, 200_000);
    defer a.free(spans);
    for (spans) |span| {
        if (span.paragraph_index != index or span.start >= end or start >= span.end) continue;
        var found = false;
        for (result.items) |*value| if (value.element_index == span.begin_element) {
            value.dirty = true;
            found = true;
        };
        if (!found) try result.append(a, .{ .element_index = span.begin_element, .dirty = true });
    }
    return result;
}
