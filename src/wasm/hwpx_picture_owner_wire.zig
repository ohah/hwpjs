const std = @import("std");
const Owner = @import("../hwpx/picture_owner.zig").Owner;

pub fn encode(a: std.mem.Allocator, owner: Owner) ![]u8 {
    const paragraph = std.math.cast(u32, owner.paragraph) orelse return error.LimitExceeded;
    const node = std.math.cast(u32, owner.anchor_node) orelse return error.LimitExceeded;
    const unit = std.math.cast(u32, owner.anchor_unit) orelse return error.LimitExceeded;
    if (paragraph == 0) return error.InvalidPictureOwner;
    const bytes = try a.alloc(u8, 16);
    std.mem.writeInt(u32, bytes[0..4], 0x314f5048, .little);
    std.mem.writeInt(u32, bytes[4..8], paragraph, .little);
    std.mem.writeInt(u32, bytes[8..12], node, .little);
    std.mem.writeInt(u32, bytes[12..16], unit, .little);
    return bytes;
}

test "HWPX picture owner wire releases allocation failures and rejects missing paragraph" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try encode(allocator, .{ .paragraph = 1, .anchor_node = 7, .anchor_unit = 0 });
            defer allocator.free(bytes);
            try std.testing.expectEqual(@as(u32, 0x314f5048), std.mem.readInt(u32, bytes[0..4], .little));
            try std.testing.expectEqual(@as(u32, 1), std.mem.readInt(u32, bytes[4..8], .little));
            try std.testing.expectEqual(@as(u32, 7), std.mem.readInt(u32, bytes[8..12], .little));
            try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, bytes[12..16], .little));
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidPictureOwner, encode(a, .{ .paragraph = 0, .anchor_node = 7, .anchor_unit = 0 }));
}
