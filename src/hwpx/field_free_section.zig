//! 필드 소유권을 다시 해석하지 않고 기존 마커 관측 결과로 구역을 보호한다.
const std = @import("std");
pub fn validate(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, limit: usize) !void {
    var fields = try @import("field_markers.zig").inspect(a, &.{tree.*}, .{ .max_owned_bytes = limit });
    defer fields.deinit();
    if (fields.markers.len != 0) return error.ProtectedFieldRange;
}
