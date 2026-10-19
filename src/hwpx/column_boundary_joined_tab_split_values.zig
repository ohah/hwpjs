//! 검증된 단 설정/탭 초안을 기존 현재 문단 모델에 설치합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize) !model.Values {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (id == 0) return error.InvalidParagraphId;
    for (current.paragraphs) |paragraph| if (paragraph.generated_id == id) return error.DuplicateParagraphId;
    const selected = &current.paragraphs[index];
    const joined = selected.joined() orelse return error.MissingJoinedParagraph;
    const anchors = @import("paragraph_joined_anchor_mode.zig").has(tree, &joined);
    const group = try @import("column_boundary_group.zig").locate(current, index);
    if (selected.protected_positions != null) {
        if (anchors) try @import("column_boundary_joined_group.zig").validateWithAnchors(a, tree, current.paragraphs[group.start..group.end]) else try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, current.paragraphs[group.start..group.end]);
    }
    var draft = if (selected.protected_positions != null) try @import("column_boundary_joined_tab_split.zig").prepareValidatedGroup(a, tree, selected, at, end, limit) else try @import("column_boundary_joined_tab_split.zig").prepare(a, tree, selected, at, end, limit);
    defer draft.deinit(a);
    var result = try @import("paragraph_structure_joined_tab_split.zig").fromDraft(a, current, index, id, limit, &draft.text);
    errdefer result.deinit(a);
    result.paragraphs[index].column_boundaries = try a.dupe(@import("column_boundary_position.zig").Position, draft.columns.left);
    result.paragraphs[index + 1].column_boundaries = try a.dupe(@import("column_boundary_position.zig").Position, draft.columns.right);
    result.paragraphs[index].column_structure_changed = selected.column_structure_changed;
    result.paragraphs[index + 1].column_structure_changed = selected.column_structure_changed;
    if (anchors) try @import("column_boundary_joined_group.zig").validateWithAnchors(a, tree, result.paragraphs[group.start .. group.end + 1]) else try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, result.paragraphs[group.start .. group.end + 1]);
    _ = try result.byteSize(limit);
    return result;
}

test "HWPX column anchor split candidate partitions actual table hosts atomically" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/borderfill.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraphPair(0, 1, 5));
    const section = &session.sections[0];
    const current = &section.structure_values.?;
    var candidate = try prepare(a, &section.tree, current, 0, 1, 1, 100000001, 4_000_000);
    defer candidate.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), candidate.paragraphs[0].protected_positions.?.len);
    try std.testing.expectEqual(@as(usize, 1), candidate.paragraphs[1].protected_positions.?.len);
    try std.testing.expectEqual(@as(usize, 1), candidate.paragraphs[0].column_boundaries.?.len);
    try std.testing.expectEqual(@as(usize, 0), candidate.paragraphs[1].column_boundaries.?.len);
    try @import("column_boundary_joined_group.zig").validateWithAnchors(a, &section.tree, candidate.paragraphs[0..2]);
    try std.testing.expect(try @import("column_boundary_joined_splice.zig").spliceGroupWithAnchors(a, &section.tree, candidate.paragraphs[0..2], 1, 0, 0, "오른쪽😀", 4_000_000));
    try @import("column_boundary_joined_group.zig").validateWithAnchors(a, &section.tree, candidate.paragraphs[0..2]);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, before: *const model.Values) !void {
            var output = try prepare(allocator, tree, before, 0, 1, 1, 100000001, 4_000_000);
            defer output.deinit(allocator);
            _ = try @import("column_boundary_joined_splice.zig").spliceGroupWithAnchors(allocator, tree, output.paragraphs[0..2], 1, 0, 0, "오른쪽😀", 4_000_000);
        }
    }.run, .{ &section.tree, current });
    try std.testing.expectEqual(@as(usize, 2), current.paragraphs[0].protected_positions.?.len);
    try std.testing.expectEqualSlices(u8, input, session.source);
    const merged = try session.save();
    defer a.free(merged);
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const split = try session.save();
    defer a.free(split);
    var reopened = try @import("editor_session.zig").open(a, split, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, reopened.sections[0].tree.source, "<hp:tbl "));
    try std.testing.expect(try session.mergeParagraphPair(0, 1, 2));
    const rejoined = try session.save();
    defer a.free(rejoined);
    try std.testing.expectEqualSlices(u8, merged, rejoined);
}
