//! 병합 문단의 탭을 재분할 결과 한쪽에만 귀속합니다.
const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;
const Position = @import("paragraph_structure_values.zig").ProtectedPosition;

pub const Plan = struct {
    left: []Position,
    right: []Position,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.left);
        a.free(self.right);
        self.* = undefined;
    }
};

pub fn build(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, at: u32, end: u32) !Plan {
    const segments = try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, current);
    defer a.free(segments);
    return fromPositions(a, current, segments, at, end);
}

/// 원본 바인딩이 검증된 위치 배열만 전달합니다.
pub fn fromPositions(a: std.mem.Allocator, current: *const Joined, segments: []const @import("paragraph_text_positions.zig").Segment, at: u32, end: u32) !Plan {
    const positions = @import("paragraph_text_positions.zig");
    try positions.validateRange(segments, at, end);
    try positions.validateBoundary(&current.sites, segments, at);
    try positions.validateBoundary(&current.sites, segments, end);
    try @import("paragraph_joined_positions.zig").validateTabIdentities(a, segments);
    const left = try @import("paragraph_protected_positions.zig").side(a, segments, at, end, false);
    errdefer a.free(left);
    const right = try @import("paragraph_protected_positions.zig").side(a, segments, at, end, true);
    return .{ .left = left, .right = right };
}
