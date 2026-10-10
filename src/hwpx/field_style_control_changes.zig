//! 일반/빈 서식 run이 공유하는 필드 귀속·dirty·생성 설정 제거입니다.
const std = @import("std");
const Change = @import("xml_source_writer.zig").Change;
pub const Range = struct { start: usize, end: usize };

pub fn append(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, run_index: usize, exposed: []const Range, owned: []const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool, changes: *std.ArrayList(Change), tags: *std.ArrayList([]u8), limit: usize) !void {
    const run = tree.elements[run_index];
    const base = run.start_tag.start;
    var child = run.first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const control = tree.elements[index];
        const field_control = @import("retained_field_marker.zig").supported(tree, index);
        const remove_setting = continuation and !field_control and @import("paragraph_continuation_metadata.zig").remove(control, true);
        if (!field_control and !remove_setting) continue;
        var visible = false;
        for (exposed) |range| if (control.start_tag.start >= range.start and control.end <= range.end) {
            visible = true;
        };
        if (!visible) continue;
        var retained = false;
        if (field_control) for (owned) |position| {
            if (position.element_index == control.first_child.?) retained = true;
        };
        if (remove_setting or !retained) {
            try changes.append(a, .{ .start = control.start_tag.start - base, .end = control.end - base, .text = "" });
            continue;
        }
        const marker = control.first_child.?;
        for (fields) |field| {
            if (field.element_index != marker) continue;
            const tag = try @import("field_dirty_tag.zig").write(a, tree, marker, field.dirty, limit);
            tags.append(a, tag) catch |err| {
                a.free(tag);
                return err;
            };
            const span = tree.elements[marker].start_tag;
            if (!std.mem.eql(u8, tag, tree.source[span.start..span.end])) try changes.append(a, .{ .start = span.start - base, .end = span.end - base, .text = "", .start_tag = tag });
        }
    }
}
