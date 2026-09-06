const std = @import("std");
const t = std.testing;
fn allocationCase(a: std.mem.Allocator, scenario: u8) !void {
    var raw = [_]u8{0} ** 52;
    std.mem.writeInt(u32, raw[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], 0x246c696e, .little);
    std.mem.writeInt(u32, raw[8..12], 78 | (1 << 10) | (18 << 20), .little);
    std.mem.writeInt(u16, raw[28..30], 0x8000, .little);
    @memcpy(raw[30..52], raw[8..30]);
    var bytes: []const u8 = raw[0..30];
    if (scenario == 1) bytes = raw[0..8];
    if (scenario == 2) bytes = &raw;
    if (scenario == 3) {
        std.mem.writeInt(u32, raw[8..12], 78 | (18 << 20), .little);
        bytes = raw[8..30];
    }
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = @import("line_validation.zig").inspect(tree);
    switch (scenario) {
        0 => {
            const report = try result;
            try t.expectEqual(1, report.lines);
            try t.expectEqual(1, report.nonboolean_attributes);
        },
        1 => try t.expectError(error.MissingLine, result),
        2 => try t.expectError(error.DuplicateLine, result),
        3 => try t.expectError(error.OrphanLine, result),
        else => unreachable,
    }
}
test "line owner cleanup across missing duplicate orphan and allocation failures" {
    for (0..4) |scenario| try t.checkAllAllocationFailures(t.allocator, allocationCase, .{@as(u8, @intCast(scenario))});
}
fn connectorAllocationCase(a: std.mem.Allocator, scenario: u8) !void {
    var raw = [_]u8{0} ** 96;
    std.mem.writeInt(u32, raw[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], 0x24636f6c, .little);
    std.mem.writeInt(u32, raw[8..12], 78 | (1 << 10) | (40 << 20), .little);
    std.mem.writeInt(u32, raw[28..32], 0xffffffff, .little);
    @memcpy(raw[52..96], raw[8..52]);
    var bytes: []const u8 = raw[0..52];
    if (scenario == 1) bytes = raw[0..8];
    if (scenario == 2) bytes = &raw;
    if (scenario == 3) {
        std.mem.writeInt(u32, raw[8..12], 78 | (40 << 20), .little);
        bytes = raw[8..52];
    }
    if (scenario == 4) std.mem.writeInt(u32, raw[48..52], 0xffffffff, .little);
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = @import("line_validation.zig").inspect(tree);
    switch (scenario) {
        0 => try t.expectEqualDeep(@import("line_validation.zig").Report{ .connectors = 1, .unknown_connector_kinds = 1, .pending_subject_slots = 2 }, try result),
        1 => try t.expectError(error.MissingConnector, result),
        2 => try t.expectError(error.DuplicateConnector, result),
        3 => try t.expectError(error.OrphanLine, result),
        4 => try t.expectError(error.UnexpectedEnd, result),
        else => unreachable,
    }
}
test "connector ownership and count failures release every tree allocation" {
    for (0..5) |scenario| try t.checkAllAllocationFailures(t.allocator, connectorAllocationCase, .{@as(u8, @intCast(scenario))});
}
