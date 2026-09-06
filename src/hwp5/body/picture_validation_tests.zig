const std = @import("std");
const t = std.testing;
const validation = @import("picture_validation.zig");
fn check(a: std.mem.Allocator, selected: bool, scenario: u8) !void {
    var b = [_]u8{0} ** 206;
    std.mem.writeInt(u32, b[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, b[4..8], 0x24706963, .little);
    std.mem.writeInt(u32, b[8..12], 85 | (1 << 10) | (95 << 20), .little);
    b[12 + 70] = 255;
    @memcpy(b[107..206], b[8..107]);
    var bytes: []const u8 = b[0..107];
    if (scenario == 1) bytes = b[0..8];
    if (scenario == 2) bytes = &b;
    if (scenario == 3) {
        std.mem.writeInt(u32, b[8..12], 85 | (95 << 20), .little);
        bytes = b[8..107];
    }
    if (scenario == 4) {
        const size: u32 = if (selected) 90 else 72;
        std.mem.writeInt(u32, b[8..12], 85 | (1 << 10) | (size << 20), .little);
        bytes = b[0 .. 12 + size];
    }
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    var options: validation.Options = if (selected) .{ .prefix = .with_instance78, .tail = .{ .additional = .with_alpha9 } } else .{};
    if (scenario == 5) options = .{ .tail = .{} };
    const result = validation.inspect(tree, options, null);
    switch (scenario) {
        0 => try t.expectEqualDeep(validation.Report{ .pictures = 1, .unknown_image_effects = 1, .pending_references = 1, .parsed_tails = @intFromBool(selected), .additional_properties = @intFromBool(selected), .alpha_values = @intFromBool(selected), .extra_bytes = if (selected) 4 else 22 }, try result),
        1 => try t.expectError(error.MissingPicture, result),
        2 => try t.expectError(error.DuplicatePicture, result),
        3 => try t.expectError(error.OrphanPicture, result),
        4 => try t.expectError(error.UnexpectedEnd, result),
        5 => try t.expectError(error.InvalidPictureOptions, result),
        else => unreachable,
    }
}
test "picture ownership and selected tail failures clean up all allocations" {
    for ([_]bool{ false, true }) |selected| for (0..6) |scenario| try t.checkAllAllocationFailures(t.allocator, check, .{ selected, @as(u8, @intCast(scenario)) });
}
fn referenceCheck(a: std.mem.Allocator, count: usize, id: u16) !void {
    var b = [_]u8{0} ** 85;
    std.mem.writeInt(u32, b[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, b[4..8], 0x24706963, .little);
    std.mem.writeInt(u32, b[8..12], 85 | (1 << 10) | (73 << 20), .little);
    std.mem.writeInt(u16, b[83..85], id, .little);
    var tree = try @import("tree.zig").Tree.parse(a, &b, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = validation.inspect(tree, .{}, count);
    if (id > count) return t.expectError(error.InvalidPictureImageReference, result);
    const report = try result;
    try t.expectEqual(0, report.pending_references);
    try t.expectEqual(@as(usize, @intFromBool(id != 0)), report.ordinal_references);
    try t.expectEqual(@as(usize, @intFromBool(id == 0)), report.absent_references);
}
test "picture reference bounds distinguish absent IDs and release allocations" {
    for ([_]usize{ 0, 1, 2, 65534, 65535 }) |count|
        for ([_]u16{ 0, 1, 2, 3, 65535 }) |id|
            try t.checkAllAllocationFailures(t.allocator, referenceCheck, .{ count, id });
}
