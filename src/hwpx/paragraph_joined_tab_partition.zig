//! 전역 탭 소유권을 원본 조각별 지역 위치로 변환합니다.
const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;
const Position = @import("paragraph_structure_values.zig").ProtectedPosition;
const Tree = @import("xml_part_tree.zig").Tree;

pub const Parts = struct {
    items: [][]Position,
    pub fn deinit(self: *Parts, a: std.mem.Allocator) void {
        for (self.items) |items| a.free(items);
        a.free(self.items);
        self.* = undefined;
    }
};

pub fn build(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, owned: []const Position) !Parts {
    return buildMode(a, tree, current, owned, false);
}

pub fn buildWithAnchors(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, owned: []const Position) !Parts {
    return buildMode(a, tree, current, owned, true);
}

fn buildMode(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, owned: []const Position, anchors: bool) !Parts {
    const segments = if (anchors) try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, current) else try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, current);
    defer a.free(segments);
    var remaining: std.AutoHashMapUnmanaged(usize, Position) = .empty;
    defer remaining.deinit(a);
    for (owned) |item| {
        if (!anchors and item.kind != .tab) return error.SourceBindingMismatch;
        const entry = try remaining.getOrPut(a, item.element_index);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = item;
    }
    const rows = try a.alloc([]Position, current.pieces.len);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |items| a.free(items);
        a.free(rows);
    }
    var base: usize = 0;
    for (current.pieces, 0..) |piece, index| {
        if (piece.output != .current_runs or piece.template_only) return error.UnsupportedColumnBoundaryEdit;
        var local: std.ArrayList(Position) = .empty;
        defer local.deinit(a);
        var cursor: usize = 0;
        for (segments) |segment| {
            if (segment.kind == .text) {
                if (segment.index < piece.first_site or segment.index - piece.first_site >= piece.site_count) continue;
                cursor = std.math.add(usize, cursor, segment.end_unit - segment.start_unit) catch return error.LimitExceeded;
            } else {
                if (try @import("paragraph_site_owner.zig").ancestor(tree, segment.index) != piece.template_element) continue;
                const item = remaining.get(segment.index) orelse continue;
                const expected = std.math.add(usize, base, cursor) catch return error.LimitExceeded;
                if (item.unit != expected or (item.kind == .anchor) != (segment.kind == .anchor)) return error.SourceBindingMismatch;
                try local.append(a, .{ .element_index = item.element_index, .kind = item.kind, .unit = cursor });
                _ = remaining.remove(segment.index);
                cursor = std.math.add(usize, cursor, 1) catch return error.LimitExceeded;
            }
        }
        rows[index] = try local.toOwnedSlice(a);
        initialized += 1;
        var paragraph = try current.paragraph(index);
        paragraph.protected_positions = rows[index];
        const checked = try @import("paragraph_protected_positions.zig").buildSingle(a, tree, &paragraph);
        a.free(checked);
        base = std.math.add(usize, base, cursor) catch return error.LimitExceeded;
    }
    if (remaining.count() != 0) return error.SourceBindingMismatch;
    return .{ .items = rows };
}
