const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const types = @import("type_table.zig");
const backdrop = @import("backdrop.zig");

const fixture = @import("backdrop_test_fixture.zig").make;
fn exercise(a: std.mem.Allocator) !void {
    var f = fixture();
    var table = types.Table.init(a, .{});
    defer table.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = 1 };
    const value = backdrop.readObservedEmptyPicture(&reader, &table) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        return err;
    };
    try t.expectEqual(f.end, value.end);
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqualSlices(u32, &.{ 0, 123, 9 }, &value.object_ids);
    try t.expectEqual(@as(u16, 0x1234), value.fill_suffix);
    @memset(&f.bytes, 0);
    try t.expectEqualSlices(u8, &(@as([50]u8, @splat(0xa5))), &value.raw_backdrop);
    try t.expectEqualSlices(u8, &(@as([34]u8, @splat(0xa5))), &value.raw_fill);
    try t.expectEqualSlices(u8, &.{ 0xa5, 0xa5, 0xa5, 0xa5 }, &value.raw_picture);
}
test "chart backdrop raw ownership sparse IDs and allocation failure" {
    try exercise(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("backdrop success leak");
    try exercise(gpa.allocator());
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
fn reject(a: std.mem.Allocator, bytes: []const u8, expected: anyerror, options: types.Options) !void {
    var table = types.Table.init(a, options);
    defer table.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = backdrop.readObservedEmptyPicture(&reader, &table) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedBackdropRejection;
}
test "chart backdrop every cut rejects without consuming cursor" {
    const f = fixture();
    for (1..f.end) |cut| try reject(t.allocator, f.bytes[0..cut], error.UnexpectedEnd, .{});
}
test "chart backdrop unsupported picture references duplicates classes and budgets" {
    const original = fixture();
    var f = original;
    f.bytes[f.picture_data] = 0;
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartPictureData, .{});
    try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes[0..f.end], error.UnsupportedChartPictureData, types.Options{} });
    f = original;
    std.mem.writeInt(u32, f.bytes[f.second_id..][0..4], 0, .little);
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartObjectReference, .{});
    for ([_]u32{ 0, 123 }) |id| {
        f = original;
        std.mem.writeInt(u32, f.bytes[f.third_id..][0..4], id, .little);
        try reject(t.allocator, f.bytes[0 .. f.third_id + 4], error.UnsupportedChartObjectReference, .{});
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartObjectReference, .{});
    }
    f = original;
    std.mem.writeInt(u32, f.bytes[1..5], 0xffffffff, .little);
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartObjectReference, .{});
    f = original;
    f.bytes[f.base + 6] = 'X';
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartClass, .{});
    f = original;
    f.bytes[f.base + 15] = 2;
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartTypeVersion, .{});
    f = original;
    try reject(t.allocator, f.bytes[0..f.end], error.LimitExceeded, .{ .max_types = 3 });
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("backdrop leak");
    try reject(gpa.allocator(), f.bytes[0 .. f.end - 1], error.UnexpectedEnd, .{});
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
