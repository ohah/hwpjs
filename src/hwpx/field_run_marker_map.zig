//! 원본 run과 닫힌 출력 run 사이 마커 동일성을 확인하는 저장 전용 연결입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Position = @import("field_position.zig").Position;
const Dirty = @import("text_sites_save.zig").FieldDirty;
const uri = @import("document_xml.zig").paragraph_uri;

pub const Map = struct {
    /// element_index만 출력 트리에 연결합니다. 나머지는 원본 식별/좌표입니다.
    positions: []Position,
    dirty: []Dirty,
    pub fn deinit(self: *Map, a: std.mem.Allocator) void {
        a.free(self.positions);
        a.free(self.dirty);
        self.* = undefined;
    }
};

fn markerInRun(tree: *const Tree, index: usize, run: usize) bool {
    const marker = tree.elements[index];
    if (!marker.is(uri, "fieldBegin") and !marker.is(uri, "fieldEnd")) return false;
    const parent = marker.parent orelse return false;
    return tree.elements[parent].is(uri, "ctrl") and tree.elements[parent].parent == run;
}

pub fn build(a: std.mem.Allocator, source: *const Tree, run: usize, output: *const Tree, output_run: usize, owned: []const Position, fields: []const Dirty) !Map {
    if (run >= source.elements.len or output_run >= output.elements.len or !source.elements[run].is(uri, "run") or !output.elements[output_run].is(uri, "run")) return error.SourceBindingMismatch;
    var translated: std.ArrayList(Position) = .empty;
    defer translated.deinit(a);
    var dirty: std.ArrayList(Dirty) = .empty;
    defer dirty.deinit(a);
    var cursor = output_run + 1;
    for (source.elements, 0..) |element, index| {
        if (!markerInRun(source, index, run)) continue;
        while (cursor < output.elements.len and !markerInRun(output, cursor, output_run)) cursor += 1;
        if (cursor >= output.elements.len) return error.SourceBindingMismatch;
        const span = output.elements[cursor].start_tag;
        if (!std.mem.eql(u8, source.source[element.start_tag.start..element.start_tag.end], output.source[span.start..span.end])) return error.SourceBindingMismatch;
        for (owned) |position| if (position.element_index == index) {
            var projected = position;
            projected.element_index = cursor;
            try translated.append(a, projected);
        };
        for (fields) |field| if (field.element_index == index) try dirty.append(a, .{ .element_index = cursor, .dirty = field.dirty });
        cursor += 1;
    }
    while (cursor < output.elements.len) : (cursor += 1) if (markerInRun(output, cursor, output_run)) return error.SourceBindingMismatch;
    const positions = try translated.toOwnedSlice(a);
    errdefer a.free(positions);
    return .{ .positions = positions, .dirty = try dirty.toOwnedSlice(a) };
}
