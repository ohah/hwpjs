//! 네임스페이스가 닫힌 run의 마커를 원본에 연결해 공통 귀속 규칙을 적용합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Position = @import("field_position.zig").Position;
const Dirty = @import("text_sites_save.zig").FieldDirty;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn write(a: std.mem.Allocator, source: *const Tree, run: usize, rendered: []const u8, owned: []const Position, fields: []const Dirty, continuation: bool, limit: usize) ![]u8 {
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>";
    const wrapper = try std.mem.concat(a, u8, &.{ prefix, rendered, "</p:p></s:sec>" });
    defer a.free(wrapper);
    var parsed = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{ .max_xml_bytes = wrapper.len });
    defer parsed.deinit(a);
    if (parsed.elements.len < 3 or !parsed.elements[2].is(uri, "run")) return error.SourceBindingMismatch;
    var mapped = try @import("field_run_marker_map.zig").build(a, source, run, &parsed, 2, owned, fields);
    defer mapped.deinit(a);
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer changes.deinit(a);
    var tags: std.ArrayList([]u8) = .empty;
    defer {
        for (tags.items) |tag| a.free(tag);
        tags.deinit(a);
    }
    const node = parsed.elements[2];
    const ending = node.end_tag orelse {
        if (mapped.positions.len != 0 or mapped.dirty.len != 0) return error.SourceBindingMismatch;
        if (rendered.len > limit) return error.LimitExceeded;
        return a.dupe(u8, rendered);
    };
    try @import("field_style_control_changes.zig").append(a, &parsed, 2, &.{.{ .start = node.start_tag.end, .end = ending.start }}, mapped.positions, mapped.dirty, continuation, &changes, &tags, limit);
    return @import("xml_source_writer.zig").write(a, rendered, changes.items, limit);
}
