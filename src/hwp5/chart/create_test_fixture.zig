//! Independently authored component inputs; not a copied HWP/OLE template.
const std = @import("std");
pub const fallback = @embedFile("test_fixtures/create-fallback-2x1.png");
pub const data: @import("../../hwpx/chart_create_data.zig").Data = .{
    .categories = &.{ "One", "Two", "Three" },
    .series = &.{.{ .name = "Own", .values = &.{ "10", "20", "30" } }},
};
pub const version: @import("../version.zig").Version = .{ .raw = 0x05000302 };
pub const names: []const []const u8 = &.{ "BıN0002.OLE", "bin0003.jpg" };
pub fn docinfo(a: std.mem.Allocator) ![]u8 {
    var result: std.ArrayList(u8) = .empty;
    errdefer result.deinit(a);
    var mapping: [72]u8 = @splat(0);
    std.mem.writeInt(i32, mapping[0..4], 2, .little);
    try @import("../record_writer.zig").append(a, &result, 17, 0, &mapping, 4096);
    for ([_]u16{ 1, 9 }) |id| {
        var payload: [4]u8 = undefined;
        std.mem.writeInt(u16, payload[0..2], 0x22, .little);
        std.mem.writeInt(u16, payload[2..4], id, .little);
        try @import("../record_writer.zig").append(a, &result, 18, 1, &payload, 4096);
    }
    try @import("../record_writer.zig").append(a, &result, 1023, 2, "CHILD-OWN", 4096);
    try @import("../record_writer.zig").append(a, &result, 1000, 1, "TAIL-OWN", 4096);
    return result.toOwnedSlice(a);
}
