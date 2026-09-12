const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig");
const format = @import("text_format.zig");
// Sparse type IDs, base-before-fields, non-UTF8 payload and nonzero trailer.
const fixture = [_]u8{ 90, 0, 0, 0, 77, 0, 0, 0, 13, 0 } ++ "VtTextFormat\x00".* ++ [_]u8{ 1, 0, 52, 0, 0, 0, 9, 0 } ++ "VtObject\x00".* ++ [_]u8{ 1, 0, 0x55, 0xaa, 91, 0, 0, 0, 78, 0, 0, 0, 9, 0 } ++ "VtString\x00".* ++ [_]u8{ 1, 0, 2, 0, 0xff, 0x80, 173, 51, 0, 0, 0, 8, 0 } ++ "VtValue\x00".* ++ [_]u8{ 1, 0, 52, 0, 0, 0 };
fn exercise(a: std.mem.Allocator, start: usize) !void {
    const bytes = try a.alloc(u8, start + fixture.len + 1);
    defer a.free(bytes);
    @memset(bytes, 0xa5);
    @memcpy(bytes[start..][0..fixture.len], &fixture);
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.Table.init(a, .{ .max_objects = 3, .max_total_string_bytes = 2 });
    defer objects.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = start };
    const result = format.readObservedV1(&reader, &types, &objects, 2) catch |err| {
        try t.expectEqual(start, reader.offset);
        return err;
    };
    try t.expectEqual(@as(u32, 90), result.object_id);
    try t.expectEqual(@as(u16, 0xaa55), result.raw_word);
    try t.expectEqual(@as(u32, 91), result.code.object_id);
    try t.expectEqualSlices(u8, &.{ 0xff, 0x80 }, result.code.bytes);
    try t.expectEqual(@as(u8, 173), result.code.trailer);
    try t.expect(result.code_introduced);
    try t.expectEqual(start + fixture.len, reader.offset);
    try t.expectEqual(reader.offset, result.end);
    try t.expectEqual(@as(usize, 2), objects.string_bytes);
    // A second format reuses declared types and a String ID only.
    const alias = [_]u8{ 92, 0, 0, 0, 77, 0, 0, 0, 52, 0, 0, 0, 0x34, 0x12, 91, 0, 0, 0 };
    reader = .{ .bytes = &alias };
    const again = format.readObservedV1(&reader, &types, &objects, 2) catch |err| {
        try t.expectEqual(@as(usize, 0), reader.offset);
        return err;
    };
    try t.expect(!again.code_introduced);
    try t.expectEqual(@as(u16, 0x1234), again.raw_word);
    try t.expectEqual(@as(usize, alias.len), again.end);
    try t.expect(again.code.bytes.ptr == result.code.bytes.ptr);
    try t.expectEqual(@as(usize, 2), objects.string_bytes);
    try t.expectEqual(@as(u32, 3), objects.entries.count());
}
fn reject(a: std.mem.Allocator, bytes: []const u8, options: Objects.Options, expected: anyerror) !void {
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.Table.init(a, options);
    defer objects.deinit();
    var reader: Reader = .{ .bytes = bytes };
    _ = format.readObservedV1(&reader, &types, &objects, 2) catch |err| {
        try t.expectEqual(@as(usize, 0), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedFormatRejection;
}
test "chart text format fields aliases offsets OOM and ownership" {
    for ([_]usize{ 0, 1, 17, 257 }) |start| {
        try exercise(t.allocator, start);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{start});
    }
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("format leak");
    try exercise(gpa.allocator(), 17);
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
test "chart text format cuts versions classes caps collision and late error cleanup" {
    for (0..fixture.len) |cut| try reject(t.allocator, fixture[0..cut], .{}, error.UnexpectedEnd);
    // Every declaration, not only the leading format type.
    for ([_]usize{ 10, 31, 54, 76 }, [_]usize{ 23, 40, 63, 84 }) |name, version| {
        var bad = fixture;
        bad[name] ^= 1;
        try reject(t.allocator, &bad, .{}, error.UnsupportedChartClass);
        bad = fixture;
        bad[version] ^= 1;
        try reject(t.allocator, &bad, .{}, error.UnsupportedChartTypeVersion);
    }
    try reject(t.allocator, &fixture, .{ .max_objects = 1 }, error.LimitExceeded);
    try reject(t.allocator, &fixture, .{ .max_total_string_bytes = 1 }, error.LimitExceeded);
    var collision = fixture;
    collision[44] = 90;
    try reject(t.allocator, &collision, .{}, error.UnsupportedChartObjectReference);
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("format error leak");
    try reject(gpa.allocator(), fixture[0 .. fixture.len - 1], .{}, error.UnexpectedEnd);
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    try t.checkAllAllocationFailures(t.allocator, reject, .{ fixture[0 .. fixture.len - 1], Objects.Options{}, error.UnexpectedEnd });
}
