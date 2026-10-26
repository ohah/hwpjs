//! Fixed wire layout only; semantic run/resource validation belongs to callers.
const std = @import("std");
const Run = @import("../../model/document.zig").CharacterRun;

pub fn encode(a: std.mem.Allocator, runs: []const Run) ![]u8 {
    if (runs.len > std.math.maxInt(u16)) return error.LimitExceeded;
    const bytes = try a.alloc(u8, runs.len * 8);
    for (runs, 0..) |run, i| {
        std.mem.writeInt(u32, bytes[i * 8 ..][0..4], run.start_unit, .little);
        std.mem.writeInt(u32, bytes[i * 8 + 4 ..][0..4], run.char_shape_id, .little);
    }
    return bytes;
}

test "character run payload matches fixed little endian bytes and allocation failures" {
    const a = std.testing.allocator;
    const runs = [_]Run{ .{ .start_unit = 0, .char_shape_id = 0x12345678 }, .{ .start_unit = 0xabcdef, .char_shape_id = 0x88ff77 } };
    const expected = [_]u8{ 0, 0, 0, 0, 0x78, 0x56, 0x34, 0x12, 0xef, 0xcd, 0xab, 0, 0x77, 0xff, 0x88, 0 };
    const bytes = try encode(a, &runs);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, &expected, bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, values: []const Run) !void {
            const encoded = try encode(allocator, values);
            defer allocator.free(encoded);
        }
    }.run, .{&runs});
    const too_many = try a.alloc(Run, 65536);
    defer a.free(too_many);
    try std.testing.expectError(error.LimitExceeded, encode(a, too_many));
}
