//! 그림 위치 응답의 명시적 little-endian 스칼라 경계입니다.
const std = @import("std");
const Site = @import("../hwpx/picture_display_sites.zig").Site;
pub fn encode(a: std.mem.Allocator, sites: []const Site) ![]u8 {
    if (sites.len > 100000) return error.LimitExceeded;
    const bytes = try a.alloc(u8, 8 + sites.len * 16);
    errdefer a.free(bytes);
    @memcpy(bytes[0..4], "HPX1");
    std.mem.writeInt(u32, bytes[4..8], @intCast(sites.len), .little);
    for (sites, 0..) |site, index| {
        const state: u32 = switch (site.state) {
            .located => 0,
            .conditional => 1,
            .unsupported_anchor => 2,
            .missing_host => 3,
            .ambiguous_host => 4,
        };
        if ((site.state == .located) != (site.anchor_unit != null) or (site.state == .located and site.paragraph == null)) return error.InvalidPictureSites;
        if (site.paragraph == 0) return error.InvalidPictureSites;
        if ((site.state == .unsupported_anchor) != (site.paragraph != null and site.anchor_unit == null)) return error.InvalidPictureSites;
        const flags = state | (@as(u32, @intFromBool(site.paragraph != null)) << 8) | (@as(u32, @intFromBool(site.anchor_unit != null)) << 9);
        const values = [_]usize{ site.picture_node, site.paragraph orelse 0, site.anchor_unit orelse 0, flags };
        for (values, 0..) |value, field| {
            const at = 8 + index * 16 + field * 4;
            std.mem.writeInt(u32, bytes[at..][0..4], std.math.cast(u32, value) orelse return error.LimitExceeded, .little);
        }
    }
    return bytes;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = try encode(a, &.{ .{ .picture_node = 4, .paragraph = 1, .anchor_unit = 0, .state = .located }, .{ .picture_node = 8, .state = .conditional } });
    defer a.free(bytes);
    try std.testing.expectEqual(@as(usize, 40), bytes.len);
    try std.testing.expectEqualSlices(u8, "HPX1", bytes[0..4]);
    try std.testing.expectEqual(@as(u32, 768), std.mem.readInt(u32, bytes[20..24], .little));
    try std.testing.expectEqual(@as(u32, 1), std.mem.readInt(u32, bytes[36..40], .little));
}

test "HWPX picture site wire validates presence and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
    try std.testing.expectError(error.InvalidPictureSites, encode(std.testing.allocator, &.{.{ .picture_node = 1, .state = .located }}));
    try std.testing.expectError(error.InvalidPictureSites, encode(std.testing.allocator, &.{.{ .picture_node = 1, .paragraph = 0, .anchor_unit = 0, .state = .located }}));
    try std.testing.expectError(error.InvalidPictureSites, encode(std.testing.allocator, &.{.{ .picture_node = 1, .paragraph = 1, .state = .conditional }}));
}
