//! Count width belongs to the logical list kind, never its low 16 bits alone.
const std = @import("std");
const Tree = @import("../body/tree.zig").Tree;
pub const Count = struct {
    value: u32,
    memo: bool,
    pub fn width(self: Count) usize {
        return if (self.memo) 4 else 2;
    }
    pub fn adjusted(self: Count, add: u32, remove: u32) !u32 {
        const total = std.math.add(u32, self.value, add) catch return error.LimitExceeded;
        if (remove > total) return error.InvalidListCountDelta;
        const value = total - remove;
        const max: u32 = if (self.memo) std.math.maxInt(i32) else std.math.maxInt(u16);
        if (value > max) return error.LimitExceeded;
        return value;
    }
    pub fn encode(self: Count, bytes: *[4]u8, add: u32, remove: u32) ![]const u8 {
        const value = try self.adjusted(add, remove);
        if (self.memo) std.mem.writeInt(u32, bytes, value, .little) else std.mem.writeInt(u16, bytes[0..2], @intCast(value), .little);
        return bytes[0..self.width()];
    }
};
pub fn read(tree: Tree, list: usize) !Count {
    if (list >= tree.nodes.len or tree.nodes[list].record.value != .list_header) return error.SourceBindingMismatch;
    const node = tree.nodes[list];
    if (list > 0) {
        const previous = tree.nodes[list - 1];
        if (previous.record.value == .memo_list and previous.parent == node.parent and previous.subtree_end == list) {
            const memo = try @import("../body/memo_list_header.zig").Header.parse(node.record.value.list_header);
            if (memo.paragraph_count < 0) return error.NegativeMemoParagraphCount;
            return .{ .value = @intCast(memo.paragraph_count), .memo = true };
        }
    }
    return .{ .value = node.record.value.list_header.count_raw, .memo = false };
}

test "memo count updates cross the short boundary without changing ordinary list width" {
    var bytes: [4]u8 = @splat(0xa5);
    const memo: Count = .{ .value = 65535, .memo = true };
    try std.testing.expectEqualSlices(u8, &.{ 0, 0, 1, 0 }, try memo.encode(&bytes, 1, 0));
    try std.testing.expectEqualSlices(u8, &.{ 0xff, 0xff, 0, 0 }, try (Count{ .value = 65536, .memo = true }).encode(&bytes, 0, 1));
    try std.testing.expectError(error.LimitExceeded, (Count{ .value = 65535, .memo = false }).adjusted(1, 0));
    try std.testing.expectError(error.LimitExceeded, (Count{ .value = 0x7fffffff, .memo = true }).adjusted(1, 0));
    try std.testing.expectError(error.InvalidListCountDelta, memo.adjusted(0, 65536));
    bytes = @splat(0xa5);
    try std.testing.expectEqualSlices(u8, &.{ 2, 0 }, try (Count{ .value = 1, .memo = false }).encode(&bytes, 1, 0));
    try std.testing.expectEqualSlices(u8, &.{ 0xa5, 0xa5 }, bytes[2..]);
}
