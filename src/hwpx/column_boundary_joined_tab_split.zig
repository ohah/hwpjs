//! 단 설정과 탭을 같은 현재 텍스트 경계에서 나누는 임시 초안입니다.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;
const tabs = @import("paragraph_joined_tab_split.zig");
const columns = @import("column_boundary_edit.zig");

pub const Draft = struct {
    text: tabs.Draft,
    columns: columns.Split,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.text.deinit(a);
        self.columns.deinit(a);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, at: u32, end: u32, limit: usize) !Draft {
    return prepareMode(a, tree, paragraph, at, end, limit, false);
}

/// 호출자가 전체 탭/단 설정 그룹 소유권을 먼저 검증한 경로입니다.
pub fn prepareValidatedGroup(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, at: u32, end: u32, limit: usize) !Draft {
    return prepareMode(a, tree, paragraph, at, end, limit, true);
}

fn prepareMode(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, at: u32, end: u32, limit: usize, validated_group: bool) !Draft {
    const joined = paragraph.joined() orelse return error.MissingJoinedParagraph;
    const anchors = @import("paragraph_joined_anchor_mode.zig").has(tree, &joined);
    const owned = paragraph.column_boundaries orelse return error.MissingColumnBoundaries;
    if (!validated_group) {
        if (paragraph.protected_positions != null or paragraph.generated_id != null) return error.UnsupportedColumnBoundaryEdit;
        try @import("column_boundary_joined_partition.zig").validateWithTabs(a, tree, &joined, owned);
    }
    var text = if (paragraph.protected_positions) |items| try tabs.prepareOwned(a, tree, &joined, items, at, end, limit) else try tabs.prepare(a, tree, &joined, at, end, limit);
    errdefer text.deinit(a);
    const positions = if (paragraph.protected_positions) |items|
        (if (anchors) try @import("paragraph_joined_positions.zig").buildOwnedAnchors(a, tree, &joined, items) else try @import("paragraph_joined_positions.zig").buildOwnedTabs(a, tree, &joined, items))
    else
        (if (anchors) try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, &joined) else try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &joined));
    defer a.free(positions);
    const units = std.math.cast(u32, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const shortened = try columns.splice(a, owned, at, end, 0, units, owned.len);
    defer a.free(shortened);
    const partition = try columns.split(a, shortened, at, units - (end - at), owned.len);
    return .{ .text = text, .columns = partition };
}
