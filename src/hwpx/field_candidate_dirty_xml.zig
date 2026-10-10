//! 여러 원본 필드 후보의 출력 마커를 원본과 대조한 뒤 dirty만 적용합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Position = @import("field_position.zig").Position;
const Dirty = @import("text_sites_save.zig").FieldDirty;

pub fn write(a: std.mem.Allocator, source: *const Tree, owned: []const Position, rendered: []const u8, fields: []const Dirty, limit: usize) ![]u8 {
    for (fields, 0..) |field, index| {
        for (fields[0..index]) |previous| if (previous.element_index == field.element_index) return error.DuplicateFieldDirty;
        if (field.element_index >= source.elements.len) return error.InvalidElementIndex;
        if (!source.elements[field.element_index].is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return error.InvalidFieldElement;
    }
    const root = source.elements[0];
    const prefix = source.source[root.start_tag.start..root.start_tag.end];
    const close = root.end_tag orelse return error.InvalidPartRoot;
    const wrapper = try std.mem.concat(a, u8, &.{ prefix, rendered, source.source[close.start..close.end] });
    defer a.free(wrapper);
    var parsed = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{ .max_xml_bytes = wrapper.len });
    defer parsed.deinit(a);
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer {
        for (changes.items) |change| a.free(change.serialized_xml.?);
        changes.deinit(a);
    }
    var cursor: usize = 0;
    for (owned) |position| {
        if (position.kind != .begin) continue;
        while (cursor < parsed.elements.len and !parsed.elements[cursor].is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) cursor += 1;
        if (cursor >= parsed.elements.len or position.element_index >= source.elements.len) return error.SourceBindingMismatch;
        const before = source.elements[position.element_index].start_tag;
        const after = parsed.elements[cursor].start_tag;
        if (!std.mem.eql(u8, source.source[before.start..before.end], parsed.source[after.start..after.end])) return error.SourceBindingMismatch;
        for (fields) |field| if (field.element_index == position.element_index) {
            const tag = try @import("field_dirty_tag.zig").write(a, source, position.element_index, field.dirty, limit);
            errdefer a.free(tag);
            try changes.append(a, .{ .start = after.start - prefix.len, .end = after.end - prefix.len, .text = "", .serialized_xml = tag });
        };
        cursor += 1;
    }
    while (cursor < parsed.elements.len) : (cursor += 1) {
        if (parsed.elements[cursor].is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return error.SourceBindingMismatch;
    }
    return @import("xml_source_writer.zig").write(a, rendered, changes.items, limit);
}
