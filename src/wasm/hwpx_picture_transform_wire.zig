//! 그림 변환 원값의 순서·존재·native 항등 판정을 전달합니다.
const std = @import("std");
const model = @import("../hwpx/picture_transform_values.zig");
pub fn encode(a: std.mem.Allocator, value: *const model.Values) ![]u8 {
    if (value.matrices.len > 1024) return error.LimitExceeded;
    const bytes = try a.alloc(u8, 24 + value.matrices.len * 56);
    errdefer a.free(bytes);
    @memset(bytes, 0);
    @memcpy(bytes[0..4], "HPT1");
    std.mem.writeInt(u32, bytes[4..8], @intCast(value.matrices.len), .little);
    std.mem.writeInt(u32, bytes[8..12], std.math.cast(u32, value.unknown_matrix_nodes) orelse return error.LimitExceeded, .little);
    var flags: u32 = if (value.angle != null) 8 else 0;
    for ([_]?bool{ value.flip[0], value.flip[1], value.reverse }, 0..) |boolean, index| {
        if (boolean) |present| {
            flags |= @as(u32, 1) << @intCast(index);
            flags |= @as(u32, @intFromBool(present)) << @intCast(index + 8);
        }
    }
    std.mem.writeInt(u32, bytes[12..16], flags, .little);
    std.mem.writeInt(u32, bytes[16..20], value.angle orelse 0, .little);
    std.mem.writeInt(u32, bytes[20..24], if (model.identity(value)) |identity| if (identity) 1 else 2 else 0, .little);
    for (value.matrices, 0..) |matrix, index| {
        const start = 24 + index * 56;
        const kind: u32 = switch (matrix.kind) {
            .translation => 0,
            .scale => 1,
            .rotation => 2,
        };
        std.mem.writeInt(u32, bytes[start..][0..4], kind, .little);
        var presence: u32 = 0;
        for (matrix.values, 0..) |component, field| {
            if (component != null) presence |= @as(u32, 1) << @intCast(field);
            const at = start + 8 + field * 8;
            std.mem.writeInt(u64, bytes[at..][0..8], @bitCast(component orelse @as(f64, 0)), .little);
        }
        std.mem.writeInt(u32, bytes[start + 4 ..][0..4], presence, .little);
    }
    return bytes;
}
fn allocationCase(a: std.mem.Allocator) !void {
    const matrices = [_]model.Matrix{.{ .kind = .scale, .values = .{ 1.5, null, 0, 0, 1, 0 } }};
    const value: model.Values = .{ .flip = .{ false, null }, .angle = 0, .reverse = true, .matrices = @constCast(&matrices) };
    const bytes = try encode(a, &value);
    defer a.free(bytes);
    try std.testing.expectEqual(@as(usize, 80), bytes.len);
    try std.testing.expectEqual(@as(u32, 1037), std.mem.readInt(u32, bytes[12..16], .little));
    try std.testing.expectEqual(@as(u32, 2), std.mem.readInt(u32, bytes[20..24], .little));
}
test "HWPX picture transform wire preserves scalar presence and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
