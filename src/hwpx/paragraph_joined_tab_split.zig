//! 기존 텍스트 분할기와 보호 요소 귀속 계획을 한 원자적 초안으로 조립합니다.
const std = @import("std");
const text = @import("paragraph_split_text.zig");
const plan = @import("paragraph_joined_tab_split_plan.zig");

pub const Draft = struct {
    text: text.Draft,
    tabs: plan.Plan,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.text.deinit(a);
        self.tabs.deinit(a);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_joined_values.zig").Joined, at: u32, end: u32, limit: usize) !Draft {
    return prepareMode(a, tree, current, at, end, limit, null);
}

pub fn prepareOwned(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_joined_values.zig").Joined, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition, at: u32, end: u32, limit: usize) !Draft {
    return prepareMode(a, tree, current, at, end, limit, owned);
}

fn prepareMode(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_joined_values.zig").Joined, at: u32, end: u32, limit: usize, owned: ?[]const @import("paragraph_structure_values.zig").ProtectedPosition) !Draft {
    if (current.character_styles != null) return error.UnsupportedAnchoredStructure;
    const projection = @import("paragraph_joined_positions.zig");
    const anchors = @import("paragraph_joined_anchor_mode.zig").has(tree, current);
    const segments = if (owned) |items|
        (if (anchors) try projection.buildOwnedAnchors(a, tree, current, items) else try projection.buildOwnedTabs(a, tree, current, items))
    else
        (if (anchors) try projection.buildWithAnchors(a, tree, current) else try projection.buildWithTabs(a, tree, current));
    defer a.free(segments);
    var count: usize = 0;
    for (segments) |segment| if (segment.kind == .text) {
        if (segment.index != count) return error.SourceBindingMismatch;
        count += 1;
    };
    if (count != current.sites.items.len) return error.SourceBindingMismatch;
    var tabs = try plan.fromPositions(a, current, segments, at, end);
    errdefer tabs.deinit(a);
    const draft = try text.fromPositions(a, &current.sites, segments, current.pieces[0].template_element, at, end, limit);
    return .{ .text = draft, .tabs = tabs };
}
