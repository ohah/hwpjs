const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const grid = @import("grid_backdrop.zig");
const fixture = @import("backdrop_test_fixture.zig");
fn exercise(a: std.mem.Allocator, start: usize) !void {
    const f = fixture.make();
    var input: [768]u8 = @splat(0xff);
    for (0..26) |i| input[start + i] = @truncate(i * 17 + 3);
    @memcpy(input[start + 26 ..][0 .. f.end - 1], f.bytes[1..f.end]);
    const end = start + 26 + f.end - 1;
    var types = Types.init(a, .{});
    defer types.deinit();
    var reader: Reader = .{ .bytes = &input, .offset = start };
    const value = grid.readObservedEmptyPicture(&reader, &types) catch |err| {
        try t.expectEqual(start, reader.offset);
        return err;
    };
    try t.expectEqual(end, reader.offset);
    try t.expectEqual(end, value.end);
    try t.expectEqual(end, value.backdrop.end);
    try t.expectEqualSlices(u8, input[start..][0..26], &value.raw);
    try t.expectEqualSlices(u32, &.{ 0, 123, 9 }, &value.backdrop.object_ids);
    try t.expectEqual(@as(u16, 0x1234), value.backdrop.fill_suffix);
    @memset(&input, 0);
    try t.expectEqual(@as(u8, 3), value.raw[0]);
    try t.expectEqual(@as(u8, 0xa5), value.backdrop.raw_backdrop[0]);
}
test "grid backdrop raw transition offsets ownership and OOM" {
    for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, start);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{@as(usize, 17)});
}
test "grid backdrop every cut and late errors preserve outer cursor and free names" {
    const f = fixture.make();
    for ([_]usize{ 0, 1, 17, 257 }) |start| {
        var input: [768]u8 = @splat(0x81);
        @memcpy(input[start + 26 ..][0 .. f.end - 1], f.bytes[1..f.end]);
        const end = start + 26 + f.end - 1;
        for (start..end) |cut| try reject(input[0..cut], start, error.UnexpectedEnd);
        input[start + 26 + f.picture_data - 1] = 0;
        try reject(input[0..end], start, error.UnsupportedChartPictureData);
        input[start + 26 + f.picture_data - 1] = 255;
        input[start + 26 + f.base - 1 + 6] = 'X';
        try reject(input[0..end], start, error.UnsupportedChartClass);
    }
}
fn reject(bytes: []const u8, start: usize, expected: anyerror) !void {
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    {
        var types = Types.init(gpa.allocator(), .{});
        defer types.deinit();
        var reader: Reader = .{ .bytes = bytes, .offset = start };
        try t.expectError(expected, grid.readObservedEmptyPicture(&reader, &types));
        try t.expectEqual(start, reader.offset);
    }
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    try t.expectEqual(.ok, gpa.deinit());
}
