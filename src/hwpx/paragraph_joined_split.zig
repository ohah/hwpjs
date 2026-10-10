//! Split current piece-ordered text without rebasing XML or source coverage.
//! Output is a text draft; paragraph identity/coverage belong to topology.
const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;

pub const Draft = struct {
    left: Joined,
    right: Joined,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.left.deinit(a);
        self.right.deinit(a);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, at: u32, end: u32, limit: usize) !Draft {
    return prepareMode(a, tree, current, at, end, limit, false);
}

/// 필드 마커 소유 분할은 호출자가 담당하며 텍스트 절단 거래만 공유합니다.
pub fn prepareWithFields(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, at: u32, end: u32, limit: usize) !Draft {
    return prepareMode(a, tree, current, at, end, limit, true);
}

fn prepareMode(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, at: u32, end: u32, limit: usize, fields: bool) !Draft {
    const positions = if (fields) try @import("paragraph_joined_positions.zig").buildWithFields(a, tree, current) else try @import("paragraph_joined_positions.zig").build(a, tree, current);
    defer a.free(positions);
    try @import("paragraph_text_positions.zig").validateRange(positions, at, end);
    const units = if (positions.len == 0) 0 else positions[positions.len - 1].end_unit;
    const total = std.math.cast(u32, units) orelse return error.LimitExceeded;
    var left = try current.clone(a);
    errdefer left.deinit(a);
    var right = try current.clone(a);
    errdefer right.deinit(a);
    _ = try @import("text_splice_transaction.zig").spliceProjected(a, &left.sites, positions, at, total - at, "", limit, null);
    _ = try @import("text_splice_transaction.zig").spliceProjected(a, &right.sites, positions, 0, end, "", limit, null);
    if (current.character_styles != null) {
        const styles = try @import("character_style_joined_projection.zig").complete(a, tree, current);
        defer a.free(styles);
        const left_styles = try @import("character_style_split.zig").side(a, styles, &current.sites, &left.sites, at, false, 1_000_000);
        a.free(left.character_styles.?);
        left.character_styles = left_styles;
        const right_styles = try @import("character_style_split.zig").side(a, styles, &current.sites, &right.sites, end, true, 1_000_000);
        a.free(right.character_styles.?);
        right.character_styles = right_styles;
    }
    const left_bytes = try left.byteSize(limit);
    _ = try right.byteSize(limit - left_bytes);
    return .{ .left = left, .right = right };
}

test "HWPX joined split draft preserves piece order and atomic failures" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>A😀B</p:t></p:run></p:p><p:p id='10'><p:run><p:t>CD</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const current = session.sections[0].structure_values.?.paragraphs[0].joined().?;
    var draft = try prepare(a, &session.sections[0].tree, &current, 3, 5, 10000);
    defer draft.deinit(a);
    try std.testing.expectEqualStrings("A😀", draft.left.sites.items[0].text);
    try std.testing.expectEqualStrings("", draft.left.sites.items[1].text);
    try std.testing.expectEqualStrings("", draft.right.sites.items[0].text);
    try std.testing.expectEqualStrings("D", draft.right.sites.items[1].text);
    try std.testing.expectEqualDeep(current.pieces, draft.left.pieces);
    try std.testing.expectEqualDeep(current.pieces, draft.right.pieces);
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, &session.sections[0].tree, &current, 2, 2, 10000));
    try std.testing.expectError(error.InvalidTextPosition, prepare(a, &session.sections[0].tree, &current, 5, 3, 10000));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &session.sections[0].tree, &current, 0, 0, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, joined: *const Joined) !void {
            var output = try prepare(allocator, tree, joined, 3, 5, 10000);
            defer output.deinit(allocator);
        }
    }.run, .{ &session.sections[0].tree, &current });
    try std.testing.expectEqualStrings("A😀B", current.sites.items[0].text);
    try std.testing.expectEqualStrings("CD", current.sites.items[1].text);
}
