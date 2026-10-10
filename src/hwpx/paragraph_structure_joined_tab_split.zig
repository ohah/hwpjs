//! 탭 분할 초안을 기존 문단 토폴로지와 보호 위치 소유권으로 연결합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize) !model.Values {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (id == 0) return error.InvalidParagraphId;
    for (current.paragraphs) |paragraph| if (paragraph.generated_id == id) return error.DuplicateParagraphId;
    const selected = &current.paragraphs[index];
    if (selected.column_boundaries != null) return error.UnsupportedAnchoredStructure;
    const joined = selected.joined() orelse return error.SourceBindingMismatch;
    var split = if (selected.protected_positions) |owned| try @import("paragraph_joined_tab_split.zig").prepareOwned(a, tree, &joined, owned, at, end, limit) else try @import("paragraph_joined_tab_split.zig").prepare(a, tree, &joined, at, end, limit);
    defer split.deinit(a);
    return fromDraft(a, current, index, id, limit, &split);
}

/// 검증된 텍스트/탭 초안을 기존 문단 모델 조립기에 전달합니다.
pub fn fromDraft(a: std.mem.Allocator, current: *const model.Values, index: usize, id: u32, limit: usize, split: *const @import("paragraph_joined_tab_split.zig").Draft) !model.Values {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (id == 0) return error.InvalidParagraphId;
    for (current.paragraphs) |paragraph| if (paragraph.generated_id == id) return error.DuplicateParagraphId;
    const joined = current.paragraphs[index].joined() orelse return error.SourceBindingMismatch;
    var draft = try textDraft(a, &joined, split);
    defer draft.deinit(a);
    return @import("paragraph_structure_joined_split.zig").assemble(a, current, index, id, limit, &draft, split.tabs.left, split.tabs.right);
}

fn textDraft(a: std.mem.Allocator, joined: *const @import("paragraph_joined_values.zig").Joined, split: *const @import("paragraph_joined_tab_split.zig").Draft) !@import("paragraph_joined_split.zig").Draft {
    var left = try joined.clone(a);
    errdefer left.deinit(a);
    const left_sites = try split.text.left.clone(a);
    left.sites.deinit(a);
    left.sites = left_sites;
    var right = try joined.clone(a);
    errdefer right.deinit(a);
    const right_sites = try split.text.right.clone(a);
    right.sites.deinit(a);
    right.sites = right_sites;
    return .{ .left = left, .right = right };
}
