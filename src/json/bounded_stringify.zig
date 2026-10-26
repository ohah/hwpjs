//! Count deterministic JSON before allocating its exact bounded output.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, value: anytype, max_bytes: usize) ![]u8 {
    var buffer: [4096]u8 = undefined;
    var counter: std.Io.Writer.Discarding = .init(&buffer);
    try std.json.Stringify.value(value, .{}, &counter.writer);
    const size = counter.fullCount();
    if (size > max_bytes or size > std.math.maxInt(usize)) return error.LimitExceeded;
    const bytes = try a.alloc(u8, @intCast(size));
    errdefer a.free(bytes);
    var output: std.Io.Writer = .fixed(bytes);
    try std.json.Stringify.value(value, .{}, &output);
    if (output.buffered().len != bytes.len) return error.InvalidJsonOutputSize;
    return bytes;
}

test "bounded JSON checks escaped byte count before output allocation and preserves failures" {
    const a = std.testing.allocator;
    const value = .{ .text = "한😀\r\n\x00", .present = @as(?u32, null) };
    const expected = try std.json.Stringify.valueAlloc(a, value, .{});
    defer a.free(expected);
    const actual = try encode(a, value, expected.len);
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
    var failing: std.testing.FailingAllocator = .init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.LimitExceeded, encode(failing.allocator(), value, expected.len - 1));
    try std.testing.expect(!failing.has_induced_failure);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try encode(allocator, .{ .text = "한😀\r\n\x00", .present = @as(?u32, null) }, 1000);
            defer allocator.free(bytes);
        }
    }.run, .{});
}
