const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const values = @import("value_object.zig");
// Independent sparse-ID declaration and raw payload fixture at offset one.
const number = [_]u8{ 0xa5, 90, 0, 0, 0, 77, 0, 0, 0, 9, 0 } ++ "VtDouble\x00".* ++ [_]u8{ 1, 0 } ++ @as([8]u8, @splat(0)) ++ [_]u8{ 0x55, 0xaa, 51, 0, 0, 0, 8, 0 } ++ "VtValue\x00".* ++ [_]u8{ 1, 0, 52, 0, 0, 0, 9, 0 } ++ "VtObject\x00".* ++ [_]u8{ 1, 0 };
const names = [_]usize{ 11, 38, 54 };
const versions = [_]usize{ 20, 46, 63 };
const patterns = [_]u64{ 0, 0x8000000000000000, 0x7ff0000000000000, 0xfff0000000000000, 0x7ff0000000000001, 0x7ff8000000001234, 1, 0xffffffffffffffff };
fn exercise(a: std.mem.Allocator, bits: u64) !void {
    var bytes = number;
    std.mem.writeInt(u64, bytes[22..30], bits, .little);
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{ .max_objects = 2, .max_string_bytes = 0, .max_total_string_bytes = 0 });
    defer objects.deinit();
    try objects.registerOther(0);
    var reader: Reader = .{ .bytes = &bytes, .offset = 1 };
    const ref = objects.readValueObservedV1(&reader, &types, 0) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        try t.expectEqual(@as(u32, 1), objects.entries.count());
        try t.expectEqual(@as(usize, 0), objects.string_bytes);
        return err;
    };
    try t.expectEqual(bits, ref.value.number.bits);
    try t.expectEqual(@as(u16, 0xaa55), ref.value.number.trailer);
    try t.expectEqual(@as(u32, 90), ref.value.number.object_id);
    try t.expect(ref.introduced);
    try t.expectEqual(@as(usize, 1), ref.start);
    try t.expectEqual(bytes.len, ref.end);
    @memset(&bytes, 0);
    for (0..100) |_| {
        reader = .{ .bytes = &.{ 0xa5, 90, 0, 0, 0, 0xff }, .offset = 1 };
        const known = try objects.readValueObservedV1(&reader, &types, 0);
        try t.expect(!known.introduced);
        try t.expectEqual(bits, known.value.number.bits);
        try t.expectEqual(@as(usize, 5), reader.offset);
        try t.expectEqual(@as(u32, 2), objects.entries.count());
        try t.expectEqual(@as(usize, 0), objects.string_bytes);
    }
    reader = .{ .bytes = &.{ 90, 0, 0, 0 } };
    try t.expectError(error.UnsupportedChartObjectReference, objects.readStringObservedV1(&reader, &types, 0));
    try t.expectEqual(@as(usize, 0), reader.offset);
    try t.expectError(error.DuplicateChartObjectId, objects.registerNumber(ref.value.number));
    try t.expectError(error.DuplicateChartObjectId, objects.registerOther(90));
    try t.expectError(error.DuplicateChartObjectId, objects.registerString(.{ .object_id = 90, .bytes = &.{}, .trailer = 0 }));
    try t.expectError(error.LimitExceeded, objects.registerNumber(.{ .object_id = 91, .bits = bits, .trailer = 0 }));
    try t.expectError(error.UnsupportedChartObjectReference, objects.registerNumber(.{ .object_id = 0xffffffff, .bits = bits, .trailer = 0 }));
}
fn reject(a: std.mem.Allocator, bytes: []const u8, expected: anyerror) !void {
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = objects.readValueObservedV1(&reader, &types, 0) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        try t.expectEqual(@as(u32, 0), objects.entries.count());
        try t.expectEqual(@as(usize, 0), objects.string_bytes);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedNumberRejection;
}
test "chart number object raw float bits references caps OOM ownership and balance" {
    for (patterns) |bits| {
        try exercise(t.allocator, bits);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{bits});
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("number object leak");
        try exercise(gpa.allocator(), bits);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
test "chart number object cuts classes versions and late OOM are atomic" {
    for (1..number.len) |cut| try reject(t.allocator, number[0..cut], error.UnexpectedEnd);
    for (names, versions) |name, version| {
        var bad = number;
        bad[name] ^= 1;
        try reject(t.allocator, &bad, error.UnsupportedChartClass);
        bad = number;
        bad[version] ^= 1;
        try reject(t.allocator, &bad, error.UnsupportedChartTypeVersion);
    }
    var bad = number;
    bad[63] ^= 1;
    try t.checkAllAllocationFailures(t.allocator, reject, .{ &bad, error.UnsupportedChartTypeVersion });
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("number late leak");
    try reject(gpa.allocator(), &bad, error.UnsupportedChartTypeVersion);
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
test "chart value resolver shares string accounting and keeps required string type strict" {
    var types = Types.init(t.allocator, .{});
    defer types.deinit();
    var objects = Objects.init(t.allocator, .{ .max_objects = 2, .max_total_string_bytes = 2 });
    defer objects.deinit();
    var reader: Reader = .{ .bytes = &number, .offset = 1 };
    _ = try objects.readValueObservedV1(&reader, &types, 0);
    const text = [_]u8{ 91, 0, 0, 0, 78, 0, 0, 0, 9, 0 } ++ "VtString\x00".* ++ [_]u8{ 1, 0, 2, 0, 0xff, 0x80, 173, 51, 0, 0, 0, 52, 0, 0, 0 };
    reader = .{ .bytes = &text };
    const s = try objects.readValueObservedV1(&reader, &types, 2);
    try t.expectEqualSlices(u8, &.{ 0xff, 0x80 }, s.value.string.bytes);
    reader = .{ .bytes = &.{ 91, 0, 0, 0 } };
    try t.expectError(error.LimitExceeded, objects.readValueObservedV1(&reader, &types, 1));
    try t.expectEqual(@as(usize, 0), reader.offset);
    _ = try objects.readValueObservedV1(&reader, &types, 2);
    try t.expectEqual(@as(usize, 2), objects.string_bytes);
    reader = .{ .bytes = &number, .offset = 1 };
    try t.expectError(error.UnsupportedChartClass, values.readStringObservedV1(&reader, &types, 0));
    try t.expectEqual(@as(usize, 1), reader.offset);
}

test "chart number direct object and shared payload cursors remain atomic" {
    for ([_]usize{ 1, 22 }) |start| {
        for (start..number.len) |cut| {
            var types = Types.init(t.allocator, .{});
            defer types.deinit();
            var reader: Reader = .{ .bytes = number[0..cut], .offset = start };
            if (start == 1) {
                try t.expectError(error.UnexpectedEnd, values.readObservedV1(&reader, &types, 0));
            } else {
                try t.expectError(error.UnexpectedEnd, values.readBody(&reader, &types, "VtDouble\x00", 0));
            }
            try t.expectEqual(start, reader.offset);
        }
    }
}

test "chart number final object map insertion OOM preserves state" {
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    var types = Types.init(t.allocator, .{});
    defer types.deinit();
    var objects = Objects.init(failing.allocator(), .{});
    defer objects.deinit();
    var reader: Reader = .{ .bytes = &number, .offset = 1 };
    try t.expectError(error.OutOfMemory, objects.readValueObservedV1(&reader, &types, 0));
    try t.expectEqual(@as(usize, 1), reader.offset);
    try t.expectEqual(@as(u32, 0), objects.entries.count());
    try t.expectEqual(@as(usize, 0), objects.string_bytes);
    try t.expectEqual(@as(u32, 3), types.definitions.count());
    try t.expect(failing.has_induced_failure);
}
