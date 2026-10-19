const std = @import("std");
const source_tree = @import("source_tree.zig");
const Tree = @import("../body/tree.zig").Tree;
const version: @import("../version.zig").Version = .{ .raw = 0x05000400 };

fn fixture(length: usize) [38]u8 {
    var bytes: [38]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[0..4], 77 | (@as(u32, @intCast(length)) << 20), .little);
    bytes[8] = 1;
    bytes[10] = 1;
    return bytes;
}

test "current source tree preserves absent versus encoded empty table zones without weakening strict tree" {
    const a = std.testing.allocator;
    const bytes = fixture(22);
    try std.testing.expectError(error.UnexpectedEnd, Tree.parse(a, bytes[0..26], version, .{}));
    var absent = try source_tree.parse(a, bytes[0..26], version, .{});
    defer absent.deinit(a);
    try std.testing.expect(absent.nodes[0].record.value.table.zones == null);
    const explicit = fixture(24);
    var empty = try source_tree.parse(a, explicit[0..28], version, .{});
    defer empty.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), empty.nodes[0].record.value.table.zones.?.count());
}

test "current source tree rejects partial count and declared zone truncation" {
    for (23..34) |length| {
        var bytes = fixture(length);
        if (length >= 24) bytes[26] = 1;
        try std.testing.expectError(error.UnexpectedEnd, source_tree.parse(std.testing.allocator, bytes[0 .. 4 + length], version, .{}));
    }
}

test "current source tree cleans every allocation failure and preserves borrowed record bytes" {
    const bytes = fixture(22);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, input: []const u8) !void {
            var tree = try source_tree.parse(a, input, version, .{});
            defer tree.deinit(a);
            try std.testing.expectEqualSlices(u8, input, tree.nodes[0].record.framing.raw);
        }
    }.run, .{bytes[0..26]});
    try std.testing.expectEqualSlices(u8, &fixture(22), &bytes);
}
