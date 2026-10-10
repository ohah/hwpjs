//! 분할된 병합 문단 그룹의 탭 소유권을 검사합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, rows: []const model.Paragraph) !void {
    return validateMode(a, tree, rows, false);
}

pub fn validateWithAnchors(a: std.mem.Allocator, tree: *const Tree, rows: []const model.Paragraph) !void {
    return validateMode(a, tree, rows, true);
}

fn validateMode(a: std.mem.Allocator, tree: *const Tree, rows: []const model.Paragraph, anchors: bool) !void {
    if (rows.len == 0) return error.SourceBindingMismatch;
    const first = rows[0].joined() orelse return error.SourceBindingMismatch;
    const segments = if (anchors) try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, &first) else try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &first);
    defer a.free(segments);
    var remaining: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer remaining.deinit(a);
    for (segments) |segment| if (@import("paragraph_text_positions.zig").isInlineUnit(segment) or (anchors and segment.kind == .anchor)) {
        if ((try remaining.getOrPut(a, segment.index)).found_existing) return error.SourceBindingMismatch;
    };
    for (rows) |row| {
        const view = row.joined() orelse return error.SourceBindingMismatch;
        const owned = row.protected_positions orelse return error.SourceBindingMismatch;
        if (view.pieces.len != first.pieces.len) return error.SourceBindingMismatch;
        for (view.pieces, first.pieces) |piece, original| {
            if (piece.template_element != original.template_element) return error.SourceBindingMismatch;
        }
        var parts = if (anchors) try @import("paragraph_joined_tab_partition.zig").buildWithAnchors(a, tree, &view, owned) else try @import("paragraph_joined_tab_partition.zig").build(a, tree, &view, owned);
        defer parts.deinit(a);
        for (owned) |item| if (!remaining.remove(item.element_index)) return error.SourceBindingMismatch;
    }
    if (remaining.count() != 0) return error.SourceBindingMismatch;
}
