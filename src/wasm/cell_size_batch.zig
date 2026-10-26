//! Decode bounded cell-size requests; native session/history owns atomic application.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
pub const max_cells = 4096;
pub const stride = 16;
fn Command(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/style_preservation.zig").Command else @import("../hwpx/editor_history.zig").Command;
}
pub fn build(comptime format: Format, a: std.mem.Allocator, bytes: []const u8) ![]Command(format) {
    if (bytes.len % stride != 0) return error.InvalidCellSizeBatch;
    if (bytes.len / stride > max_cells) return error.LimitExceeded;
    const commands = try a.alloc(Command(format), bytes.len / stride);
    errdefer a.free(commands);
    var seen: std.AutoHashMapUnmanaged(u64, void) = .empty;
    defer seen.deinit(a);
    for (commands, 0..) |*command, i| {
        const row = bytes[i * stride ..][0..stride];
        const section = std.mem.readInt(u32, row[0..4], .little);
        const node = std.mem.readInt(u32, row[4..8], .little);
        const width = std.mem.readInt(u32, row[8..12], .little);
        const height = std.mem.readInt(u32, row[12..16], .little);
        const entry = try seen.getOrPut(a, @as(u64, section) << 32 | node);
        if (entry.found_existing) return error.DuplicateCellSizeEdit;
        command.* = if (format == .hwp5)
            .{ .set_cell_size = .{ .section = section, .list_node = node, .width = width, .height = height } }
        else
            .{ .kind = .cell_size, .section = section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .list_node = node, .cell_size = .{ .width = width, .height = height } };
    }
    return commands;
}

test "cell size batch decodes both formats unaligned input and every allocation failure" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var storage: [33]u8 = @splat(0);
            const bytes = storage[1..];
            std.mem.writeInt(u32, bytes[4..8], 14, .little);
            std.mem.writeInt(u32, bytes[8..12], 3879, .little);
            std.mem.writeInt(u32, bytes[12..16], 7086, .little);
            std.mem.writeInt(u32, bytes[20..24], 26, .little);
            std.mem.writeInt(u32, bytes[24..28], 7658, .little);
            inline for (.{ .hwp5, .hwpx }) |format| {
                const commands = try build(format, a, bytes);
                defer a.free(commands);
                try std.testing.expectEqual(@as(usize, 2), commands.len);
                if (format == .hwp5) {
                    try std.testing.expectEqual(@as(u32, 3879), commands[0].set_cell_size.width);
                    try std.testing.expectEqual(@as(u32, 26), commands[1].set_cell_size.list_node);
                } else {
                    try std.testing.expectEqual(.cell_size, commands[0].kind);
                    try std.testing.expectEqual(@as(u32, 7658), commands[1].cell_size.width);
                }
            }
        }
    }.run, .{});
}

test "cell size batch rejects duplicates malformed length and excessive requests" {
    const a = std.testing.allocator;
    inline for (.{ .hwp5, .hwpx }) |format| {
        try std.testing.expectError(error.DuplicateCellSizeEdit, build(format, a, &@as([32]u8, @splat(0))));
        try std.testing.expectError(error.InvalidCellSizeBatch, build(format, a, &.{0}));
        const large = try a.alloc(u8, (max_cells + 1) * stride);
        defer a.free(large);
        try std.testing.expectError(error.LimitExceeded, build(format, a, large));
        const empty = try build(format, a, &.{});
        defer a.free(empty);
        try std.testing.expectEqual(@as(usize, 0), empty.len);
    }
}
