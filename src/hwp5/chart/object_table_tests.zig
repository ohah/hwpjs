const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
// Independent complete inline String v1, sparse type IDs, opaque payload.
const inline_string = [_]u8{ 90, 0, 0, 0, 77, 0, 0, 0, 9, 0 } ++ "VtString\x00".* ++ [_]u8{ 1, 0, 2, 0, 255, 128, 173, 51, 0, 0, 0, 8, 0 } ++ "VtValue\x00".* ++ [_]u8{ 1, 0, 52, 0, 0, 0, 9, 0 } ++ "VtObject\x00".* ++ [_]u8{ 1, 0 };

fn exercise(a: std.mem.Allocator) !void {
    var objects = Objects.init(a, .{ .max_objects = 2, .max_total_string_bytes = 2 });
    defer objects.deinit();
    var types = Types.init(a, .{});
    defer types.deinit();
    try objects.registerOther(0);
    var reader: Reader = .{ .bytes = &inline_string };
    const value = objects.readStringObservedV1(&reader, &types, 2) catch |err| {
        try t.expectEqual(@as(usize, 0), reader.offset);
        try t.expectEqual(@as(u32, 1), objects.entries.count());
        try t.expectEqual(@as(usize, 0), objects.string_bytes);
        return err;
    };
    try t.expect(value.introduced);
    try t.expectEqual(inline_string.len, value.end);
    try t.expectEqual(@as(u8, 173), value.value.trailer);
    try t.expect(value.value.bytes.ptr == inline_string[23..].ptr);
    const reference = [_]u8{ 0xa5, 90, 0, 0, 0, 0xff };
    for (0..100) |_| {
        reader = .{ .bytes = &reference, .offset = 1 };
        const r = try objects.readStringObservedV1(&reader, &types, 2);
        try t.expect(!r.introduced);
        try t.expectEqual(@as(usize, 1), r.start);
        try t.expectEqual(@as(usize, 5), r.end);
        try t.expectEqual(@as(usize, 5), reader.offset);
        try t.expectEqual(@as(usize, 2), objects.string_bytes);
        try t.expectEqual(@as(u32, 2), objects.entries.count());
        try t.expectEqualSlices(u8, value.value.bytes, r.value.bytes);
    }
    reader = .{ .bytes = &reference, .offset = 1 };
    try t.expectError(error.LimitExceeded, objects.readStringObservedV1(&reader, &types, 1));
    try t.expectEqual(@as(usize, 1), reader.offset);
    reader = .{ .bytes = &.{ 0, 0, 0, 0 } };
    try t.expectError(error.UnsupportedChartObjectReference, objects.readStringObservedV1(&reader, &types, 2));
    try t.expectEqual(@as(usize, 0), reader.offset);
    try t.expectError(error.DuplicateChartObjectId, objects.registerOther(90));
    try t.expectError(error.DuplicateChartObjectId, objects.registerString(value.value));
    try t.expectError(error.LimitExceeded, objects.registerOther(999));
    try t.expectError(error.UnsupportedChartObjectReference, objects.registerOther(0xffffffff));
}
test "chart object table inline references budgets wrong kind and OOM" {
    try exercise(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("object table leak");
    try exercise(gpa.allocator());
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
test "chart object table all cuts preserve object state and cursor" {
    for (0..inline_string.len) |cut| {
        var objects = Objects.init(t.allocator, .{});
        defer objects.deinit();
        var types = Types.init(t.allocator, .{});
        defer types.deinit();
        var reader: Reader = .{ .bytes = inline_string[0..cut] };
        try t.expectError(error.UnexpectedEnd, objects.readStringObservedV1(&reader, &types, 2));
        try t.expectEqual(@as(usize, 0), reader.offset);
        try t.expectEqual(@as(u32, 0), objects.entries.count());
        try t.expectEqual(@as(usize, 0), objects.string_bytes);
    }
}
test "chart object table source lifetime accounting and independent registration limits" {
    var bytes = [_]u8{ 0xff, 0 };
    var objects = Objects.init(t.allocator, .{ .max_total_string_bytes = 3, .max_string_bytes = 2 });
    defer objects.deinit();
    var types = Types.init(t.allocator, .{});
    defer types.deinit();
    try objects.registerString(.{ .object_id = 0xfffffffe, .bytes = &bytes, .trailer = 255 });
    try t.expectError(error.DuplicateChartObjectId, objects.registerOther(0xfffffffe));
    try t.expectError(error.LimitExceeded, objects.registerString(.{ .object_id = 1, .bytes = &bytes, .trailer = 0 }));
    try t.expectError(error.LimitExceeded, objects.registerString(.{ .object_id = 1, .bytes = &.{ 1, 2, 3 }, .trailer = 0 }));
    try t.expectEqual(@as(usize, 2), objects.string_bytes);
    try objects.registerString(.{ .object_id = 0, .bytes = &.{}, .trailer = 17 });
    bytes[0] = 99;
    var reader: Reader = .{ .bytes = &.{ 254, 255, 255, 255 } };
    const r = try objects.readStringObservedV1(&reader, &types, 2);
    try t.expectEqualSlices(u8, &.{ 99, 0 }, r.value.bytes);
    reader = .{ .bytes = &.{ 0, 0, 0, 0 } };
    try t.expectEqual(@as(usize, 0), (try objects.readStringObservedV1(&reader, &types, 0)).value.bytes.len);
    try t.expectEqual(@as(u32, 0), types.definitions.count());
    reader = .{ .bytes = &inline_string };
    try t.expectError(error.LimitExceeded, objects.readStringObservedV1(&reader, &types, 2));
    try t.expectEqual(@as(usize, 0), reader.offset);
    try t.expectEqual(@as(u32, 2), objects.entries.count());
    try t.expectEqual(@as(usize, 2), objects.string_bytes);
}

fn fresh(a: std.mem.Allocator) !void {
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    var types = Types.init(a, .{});
    defer types.deinit();
    var reader: Reader = .{ .bytes = &inline_string };
    // With no prior object allocation, insertion must allocate AFTER all three
    // type declarations have been parsed. Exercise that late failure as well.
    _ = objects.readStringObservedV1(&reader, &types, 2) catch |err| {
        try t.expectEqual(@as(usize, 0), reader.offset);
        try t.expectEqual(@as(u32, 0), objects.entries.count());
        try t.expectEqual(@as(usize, 0), objects.string_bytes);
        return err;
    };
    try t.expectEqual(@as(u32, 1), objects.entries.count());
    try t.expectEqual(@as(usize, 2), objects.string_bytes);
}
test "chart object table late map insertion OOM is logically atomic" {
    try fresh(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, fresh, .{});
}
