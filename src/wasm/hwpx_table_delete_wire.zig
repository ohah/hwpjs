const std = @import("std");
pub fn decodeTargets(allocator: std.mem.Allocator, bytes: []const u8) ![]usize {
    if (bytes.len < 4 or bytes.len > 4 + 4096 * 4) return error.InvalidTableDeletionTargets;
    var reader: @import("../binary/reader.zig").Reader = .{ .bytes = bytes };
    const count = try reader.readInt(u32);
    if (count == 0 or count > 4096 or bytes.len != 4 + @as(usize, count) * 4) return error.InvalidTableDeletionTargets;
    const result = try allocator.alloc(usize, count);
    errdefer allocator.free(result);
    for (result) |*node| node.* = try reader.readInt(u32);
    return result;
}
