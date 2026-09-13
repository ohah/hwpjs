const std = @import("std");
const t = std.testing;
const Allocator = @import("object_id_allocator.zig");
const Objects = @import("object_table.zig").Table;

test "chart object ID allocator chooses the lowest unoccupied valid ID" {
    var objects = Objects.init(t.allocator, .{});
    defer objects.deinit();
    try t.expectEqual(@as(u32, 0), try Allocator.findLowestAvailable(&objects, &.{}));
    try objects.registerOther(0);
    try objects.registerOther(2);
    try t.expectEqual(@as(u32, 1), try Allocator.findLowestAvailable(&objects, &.{}));
    try objects.registerOther(1);
    try t.expectEqual(@as(u32, 4), try Allocator.findLowestAvailable(&objects, &.{3}));
    try t.expectEqual(@as(u32, 3), try Allocator.findLowestAvailable(&objects, &.{ 7, 7, 0xffffffff }));
}

test "chart object ID allocator observes the current scope without reserving" {
    var objects = Objects.init(t.allocator, .{});
    defer objects.deinit();
    try objects.registerOther(0);
    const first = try Allocator.findLowestAvailable(&objects, &.{});
    try t.expectEqual(first, try Allocator.findLowestAvailable(&objects, &.{}));
    try objects.registerOther(first);
    try t.expectEqual(first + 1, try Allocator.findLowestAvailable(&objects, &.{}));
}
