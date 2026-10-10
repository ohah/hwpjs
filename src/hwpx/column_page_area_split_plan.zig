//! 혼합 소유 후보의 두 선언 배열을 같은 삭제/분할 범위로 준비합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub const Plan = struct {
    columns: @import("column_boundary_edit.zig").Split,
    areas: @import("page_area_edit.zig").Split,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        self.columns.deinit(a);
        self.areas.deinit(a);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, at: u32, end: u32, limit: usize) !Plan {
    try @import("column_page_area_joined_validate.zig").validate(a, tree, paragraph);
    return prepareValidated(a, tree, paragraph, at, end, limit);
}

pub fn prepareMember(a: std.mem.Allocator, tree: *const Tree, group: []const Paragraph, index: usize, at: u32, end: u32, limit: usize) !Plan {
    if (index >= group.len) return error.InvalidParagraphIndex;
    try @import("column_page_area_group_validate.zig").validate(a, tree, group);
    return prepareValidated(a, tree, &group[index], at, end, limit);
}

fn prepareValidated(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, at: u32, end: u32, limit: usize) !Plan {
    const joined = paragraph.joined().?;
    const positions = try @import("paragraph_joined_positions.zig").build(a, tree, &joined);
    defer a.free(positions);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, at);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, end);
    if (end < at) return error.InvalidTextPosition;
    const length = std.math.cast(u32, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const columns = paragraph.column_boundaries.?;
    const areas = paragraph.page_area_positions.?;
    if (columns.len > limit or areas.len > limit - columns.len) return error.LimitExceeded;
    const shortened = try @import("column_boundary_edit.zig").splice(a, columns, at, end, 0, length, limit);
    defer a.free(shortened);
    var column_parts = try @import("column_boundary_edit.zig").split(a, shortened, at, length - (end - at), limit);
    errdefer column_parts.deinit(a);
    const area_parts = try @import("page_area_edit.zig").split(a, areas, at, end, length, limit);
    return .{ .columns = column_parts, .areas = area_parts };
}

test "mixed declaration split plan partitions both arrays without changing source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.mergeParagraphPair(0, 1, 2);
    const section = &session.sections[0];
    const current = &section.structure_values.?.paragraphs[0];
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, source: *const Paragraph, cut: u32) !void {
            var result = try prepare(allocator, tree, source, cut, cut, 3);
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), result.columns.left.len);
            try std.testing.expectEqual(@as(usize, 0), result.columns.right.len);
            try std.testing.expectEqual(@as(usize, 0), result.areas.left.len);
            try std.testing.expectEqual(@as(usize, 2), result.areas.right.len);
            for (result.areas.right) |area| try std.testing.expectEqual(5 - cut, area.unit);
        }
    };
    for ([_]u32{ 0, 1, 2, 3, 4, 5 }) |cut| try Probe.run(a, &section.tree, current, cut);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, current, @as(u32, 1) });
    try std.testing.expectError(error.LimitExceeded, prepare(a, &section.tree, current, 1, 1, 2));
    try std.testing.expectEqual(@as(u32, 0), current.column_boundaries.?[0].unit);
    for (current.page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 5), area.unit);

    // 실제 본문의 모든 선택 범위에서 선언 identity와 양쪽 귀속을 확인합니다.
    for (0..6) |start| for (start..6) |end| {
        var result = try prepare(a, &section.tree, current, @intCast(start), @intCast(end), 3);
        defer result.deinit(a);
        try std.testing.expectEqualSlices(@import("column_boundary_position.zig").Position, current.column_boundaries.?, result.columns.left);
        try std.testing.expectEqual(@as(usize, 0), result.columns.right.len);
        try std.testing.expectEqual(@as(usize, 0), result.areas.left.len);
        try std.testing.expectEqual(@as(usize, 2), result.areas.right.len);
        for (current.page_area_positions.?, result.areas.right) |source, target| {
            try std.testing.expectEqual(source.source_element, target.source_element);
            try std.testing.expectEqual(source.source_control, target.source_control);
            try std.testing.expectEqual(@as(u32, @intCast(5 - end)), target.unit);
            try std.testing.expectEqual(@import("page_area_position.zig").canonicalAffinity(target.unit), target.affinity);
        }
    };
    try std.testing.expectError(error.InvalidTextPosition, prepare(a, &section.tree, current, 3, 2, 3));
    try std.testing.expectError(error.InvalidTextPosition, prepare(a, &section.tree, current, 0, 6, 3));
    try std.testing.expectError(error.InvalidTextPosition, prepare(a, &section.tree, current, std.math.maxInt(u32), std.math.maxInt(u32), 3));
}

test "mixed declaration split plan rejects surrogate and protected declaration deletion" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.mergeParagraphPair(0, 1, 2);
    _ = try session.splice(0, 1, 0, 0, "😀");
    const baseline = try session.save();
    defer a.free(baseline);
    const section = &session.sections[0];
    const source = &section.structure_values.?.paragraphs[0];
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, &section.tree, source, 1, 1, 3));
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, &section.tree, source, 0, 1, 3));
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, &section.tree, source, 1, 2, 3));
    var valid = try prepare(a, &section.tree, source, 2, 2, 3);
    defer valid.deinit(a);
    for (valid.areas.right) |area| try std.testing.expectEqual(@as(u32, 5), area.unit);

    // 별도 소유 후보에서 선언을 본문 안으로 옮겨 삭제 보호를 검사합니다.
    var moved = try source.clone(a);
    defer moved.deinit(a);
    for (moved.page_area_positions.?) |*area| area.unit = 3;
    try std.testing.expectError(error.ProtectedPageAreaBoundary, prepare(a, &section.tree, &moved, 2, 4, 3));
    try std.testing.expectError(error.ProtectedPageAreaBoundary, prepare(a, &section.tree, &moved, 0, 7, 3));
    for (moved.page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 3), area.unit);
    for (source.page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 7), area.unit);
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, baseline, after);
}
