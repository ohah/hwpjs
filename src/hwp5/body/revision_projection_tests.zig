const std = @import("std");
const t = std.testing;
const projection = @import("revision_projection.zig");
const Ranges = @import("range_tags.zig").Ranges;
const source = [_]u8{ 'A', 0, 'B', 0, 'C', 0, 'D', 0, 13, 0 };
fn ranges() [36]u8 {
    var b = [_]u8{0} ** 36;
    for ([_][2]u32{ .{ 2, 4 }, .{ 1, 3 }, .{ 2, 3 } }, 0..) |r, i| {
        std.mem.writeInt(u32, b[i * 12 ..][0..4], r[0], .little);
        std.mem.writeInt(u32, b[i * 12 + 4 ..][0..4], r[1], .little);
        b[i * 12 + 11] = 0x11;
    }
    return b;
}
fn allocationSuccess(a: std.mem.Allocator) !void {
    const raw = ranges();
    const out = try projection.projectObserved(a, &source, 5, try Ranges.parse(&raw), .{});
    defer a.free(out);
    try t.expectEqualSlices(u8, &.{ 'A', 0, 13, 0 }, out);
    try t.expectEqualSlices(u8, &ranges(), &raw);
}
fn lateFailure(a: std.mem.Allocator) !void {
    const raw = ranges();
    const out = projection.projectObserved(a, &source, 5, try Ranges.parse(&raw), .{ .max_output_bytes = 3 }) catch |err| switch (err) {
        error.RevisionProjectionOutputLimit => return,
        else => return err,
    };
    a.free(out);
    return error.ExpectedFailure;
}
test "observed projection unions unsorted ranges and handles all allocation failures" {
    try t.checkAllAllocationFailures(t.allocator, allocationSuccess, .{});
    try t.checkAllAllocationFailures(t.allocator, lateFailure, .{});
}
test "observed projection enforces independent input output range and missing-text limits" {
    const a = t.allocator;
    const raw = ranges();
    const rs = try Ranges.parse(&raw);
    try t.expectError(error.RevisionProjectionInputLimit, projection.projectObserved(a, &source, 5, rs, .{ .max_input_bytes = 9 }));
    try t.expectError(error.RevisionProjectionRangeLimit, projection.projectObserved(a, &source, 5, rs, .{ .max_ranges = 2 }));
    try t.expectError(error.RevisionProjectionTextCountMismatch, projection.projectObserved(a, &source, 6, rs, .{}));
    try t.expectError(error.RevisionProjectionTextCountMismatch, projection.projectObserved(a, source[0..9], 5, rs, .{}));
    try t.expectError(error.UnsupportedMissingRevisionText, projection.projectObserved(a, null, 1, rs, .{}));
    try t.expectError(error.UnsupportedMissingRevisionText, projection.projectObserved(a, null, 0xffffffff, rs, .{ .missing_text = .observed_cr }));
    try t.expectError(error.InvalidRecordArraySize, projection.projectObserved(a, &source, 5, .{ .raw = raw[0..35] }, .{}));
    const exact = try projection.projectObserved(a, &source, 5, rs, .{ .max_input_bytes = 10, .max_output_bytes = 4, .max_ranges = 3 });
    defer a.free(exact);
    try t.expectEqualSlices(u8, &.{ 'A', 0, 13, 0 }, exact);
    const cr = try projection.projectObserved(a, null, 1, try Ranges.parse(&.{}), .{ .missing_text = .observed_cr });
    defer a.free(cr);
    try t.expectEqualSlices(u8, &.{ 13, 0 }, cr);
}
test "projection validates all range bounds without interpreting other kinds" {
    var raw = ranges();
    for (0..3) |i| raw[i * 12 + 11] = 0x10;
    const copy = try projection.projectObserved(t.allocator, &source, 5, try Ranges.parse(&raw), .{});
    defer t.allocator.free(copy);
    try t.expectEqualSlices(u8, &source, copy);
    std.mem.writeInt(u32, raw[4..8], 6, .little);
    try t.expectError(error.InvalidRangePosition, projection.projectObserved(t.allocator, &source, 5, try Ranges.parse(&raw), .{}));
}
