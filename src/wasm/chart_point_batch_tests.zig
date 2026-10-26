const std = @import("std");
const t = std.testing;
const batch = @import("chart_point_batch.zig");
const packet = [_]u8{ 2, 0, 0, 0, 7, 0, 0, 0, 1, 0, 0, 0, '2', 99, 0, 0, 0, 0, 0, 0, 0 };
fn allocationCase(a: std.mem.Allocator) !void {
    const edits = try batch.decode(a, &packet);
    defer a.free(edits);
    try t.expectEqual(@as(usize, 2), edits.len);
    try t.expectEqual(@as(usize, 7), edits[0].point);
    try t.expectEqualStrings("2", edits[0].value);
    try t.expectEqualStrings("", edits[1].value);
    try t.expect(edits[0].value.ptr == packet[12..].ptr);
}
test "chart point batch wire rejects truncation trailing bytes counts and allocation failure" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
    for (0..packet.len) |length| try t.expectError(error.UnexpectedEnd, batch.decode(t.allocator, packet[0..length]));
    try t.expectError(error.InvalidChartPointBatch, batch.decode(t.allocator, &(packet ++ [_]u8{0})));
    try t.expectError(error.LimitExceeded, batch.decode(t.allocator, &.{ 1, 1, 0, 0 }));
    const empty = try batch.decode(t.allocator, &.{ 0, 0, 0, 0 });
    defer t.allocator.free(empty);
    try t.expectEqual(@as(usize, 0), empty.len);
}
