//! 여러 원본 필드의 현재 텍스트와 마커를 공통 경계로 절단합니다.
const std = @import("std");
const Position = @import("field_position.zig").Position;
pub const Draft = struct {
    text: @import("paragraph_joined_split.zig").Draft,
    left: []Position,
    right: []Position,

    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.text.deinit(a);
        a.free(self.left);
        a.free(self.right);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, start: u32, end: u32, limit: usize) !Draft {
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const checked = try @import("field_source_candidate_rows.zig").build(a, trees, section, paragraph, &report, 200_000);
    defer a.free(checked);
    return prepareValidated(a, trees, section, paragraph, start, end, limit);
}

/// 호출자가 전체 현재 그룹의 출처/마커 귀속을 검증한 뒤 사용하는 절단 거래입니다.
pub fn prepareValidated(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, start: u32, end: u32, limit: usize) !Draft {
    if (section >= trees.len) return error.InvalidSectionIndex;
    const joined = paragraph.joined() orelse return error.SourceBindingMismatch;
    const segments = try @import("field_owned_positions.zig").build(a, &trees[section], paragraph);
    defer a.free(segments);
    const length = if (segments.len == 0) 0 else segments[segments.len - 1].end_unit;
    var text = try @import("paragraph_joined_split.zig").prepareWithFields(a, &trees[section], &joined, start, end, limit);
    errdefer text.deinit(a);
    const moves = try @import("field_split_plan.zig").build(a, paragraph.field_positions.?, start, end, length, 200_000);
    defer a.free(moves);
    const left = try @import("field_structure_split.zig").side(a, moves, .left);
    errdefer a.free(left);
    const right = try @import("field_structure_split.zig").side(a, moves, .right);
    errdefer a.free(right);
    const text_bytes = std.math.add(usize, try text.left.byteSize(limit), try text.right.byteSize(limit)) catch return error.LimitExceeded;
    const marker_count = std.math.add(usize, left.len, right.len) catch return error.LimitExceeded;
    const marker_bytes = std.math.mul(usize, marker_count, @sizeOf(Position)) catch return error.LimitExceeded;
    if (text_bytes > limit or marker_bytes > limit - text_bytes) return error.LimitExceeded;
    return .{ .text = text, .left = left, .right = right };
}
