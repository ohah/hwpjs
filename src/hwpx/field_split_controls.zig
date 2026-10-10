//! 마커 분할 계획이 원본 문단의 단일 필드 ctrl을 빠짐없이 식별하는지 검사합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, owner: usize, moves: []const @import("field_split_plan.zig").Move) !void {
    if (owner >= tree.elements.len or !tree.elements[owner].is(uri, "p")) return error.SourceBindingMismatch;
    var controls: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer controls.deinit(a);
    for (moves) |move| {
        if (move.position.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        const marker = tree.elements[move.position.element_index];
        if (!marker.is(uri, if (move.position.kind == .begin) "fieldBegin" else "fieldEnd")) return error.SourceBindingMismatch;
        const control = marker.parent orelse return error.SourceBindingMismatch;
        const run = tree.elements[control].parent orelse return error.SourceBindingMismatch;
        if (!@import("retained_field_marker.zig").supported(tree, control) or !tree.elements[run].is(uri, "run") or tree.elements[run].parent != owner) return error.SourceBindingMismatch;
        if ((try controls.getOrPut(a, control)).found_existing) return error.SourceBindingMismatch;
    }
    var run = tree.elements[owner].first_child;
    while (run) |index| : (run = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "run")) continue;
        var child = tree.elements[index].first_child;
        while (child) |content| : (child = tree.elements[content].next_sibling) {
            if (@import("retained_field_marker.zig").supported(tree, content) and !controls.remove(content)) return error.SourceBindingMismatch;
        }
    }
    if (controls.count() != 0) return error.SourceBindingMismatch;
}
