const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;

test "chart type table skips repeat declarations and isolates scopes" {
    var table = Table.init(t.allocator, .{ .max_types = 1, .max_total_name_bytes = 2 });
    defer table.deinit();
    var bytes = [_]u8{ 255, 255, 255, 255, 2, 0, 'X', 0, 255, 255 };
    var reader: Reader = .{ .bytes = &bytes };
    const first = try table.readObserved16(&reader);
    try t.expect(first.introduced);
    try t.expectEqual(@as(u32, 0xffffffff), first.id);
    try t.expectEqual(@as(u16, 65535), first.declaration.version);
    bytes[6] = 'Y';
    try t.expectEqualStrings("X\x00", first.declaration.raw_name);
    reader = .{ .bytes = &bytes };
    const repeated = try table.readObserved16(&reader);
    try t.expect(!repeated.introduced);
    try t.expectEqual(@as(usize, 4), reader.offset);
    try t.expectEqualStrings("X\x00", repeated.declaration.raw_name);
    try t.expect(first.declaration.raw_name.ptr == repeated.declaration.raw_name.ptr);
    try t.expectEqual(@as(usize, 2), table.name_bytes);
    var separate = Table.init(t.allocator, .{});
    defer separate.deinit();
    reader.offset = 0;
    try t.expect((try separate.readObserved16(&reader)).introduced);
    try t.expectEqualStrings("Y\x00", separate.definitions.get(0xffffffff).?.raw_name);
}

fn exercise(a: std.mem.Allocator) !void {
    var table = Table.init(a, .{ .max_types = 32, .max_total_name_bytes = 64 });
    defer table.deinit();
    var first_name: ?[]const u8 = null;
    for (0..32) |i| {
        var bytes = [_]u8{ 0, 0, 0, 0, 2, 0, 0, 0, 0, 0 };
        std.mem.writeInt(u32, bytes[0..4], @intCast(i * 100000003), .little);
        bytes[6] = @intCast(i);
        var reader: Reader = .{ .bytes = &bytes };
        const before = table.name_bytes;
        const value = table.readObserved16(&reader) catch |err| {
            try t.expectEqual(@as(usize, 0), reader.offset);
            try t.expectEqual(before, table.name_bytes);
            try t.expectEqual(@as(u32, @intCast(i)), table.definitions.count());
            return err;
        };
        if (first_name == null) first_name = value.declaration.raw_name;
        try t.expectEqualSlices(u8, &.{ 0, 0 }, first_name.?);
        try t.expect(value.introduced);
    }
    try t.expectEqual(@as(usize, 64), table.name_bytes);
    var reader: Reader = .{ .bytes = &.{ 254, 255, 255, 255, 1, 0, 0, 1, 0 } };
    try t.expectError(error.LimitExceeded, table.readObserved16(&reader));
    try t.expectEqual(@as(usize, 0), reader.offset);
    try t.expectEqual(@as(u32, 32), table.definitions.count());
}

test "chart type table growth OOM and returned names have stable ownership" {
    try exercise(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("chart table leak");
    try exercise(gpa.allocator());
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}

test "chart type table all cuts preserve prior definitions and reader" {
    const bytes = [_]u8{ 9, 0, 0, 0, 2, 0, 'B', 0, 1, 0 };
    for (0..bytes.len) |cut| {
        var table = Table.init(t.allocator, .{});
        defer table.deinit();
        var prior: Reader = .{ .bytes = &.{ 0, 0, 0, 0, 2, 0, 'A', 0, 1, 0 } };
        _ = try table.readObserved16(&prior);
        var reader: Reader = .{ .bytes = bytes[0..cut] };
        try t.expectError(error.UnexpectedEnd, table.readObserved16(&reader));
        try t.expectEqual(@as(usize, 0), reader.offset);
        try t.expectEqual(@as(u32, 1), table.definitions.count());
        try t.expectEqual(@as(usize, 2), table.name_bytes);
        try t.expectEqualStrings("A\x00", table.definitions.get(0).?.raw_name);
    }
}

test "chart type table independent limits and malformed declarations are atomic" {
    const Options = @import("type_table.zig").Options;
    for ([_]Options{ .{ .max_types = 1 }, .{ .max_total_name_bytes = 3 } }) |options| {
        var table = Table.init(t.allocator, options);
        defer table.deinit();
        var reader: Reader = .{ .bytes = &.{ 0, 0, 0, 0, 2, 0, 'A', 0, 1, 0 } };
        _ = try table.readObserved16(&reader);
        reader = .{ .bytes = &.{ 1, 0, 0, 0, 2, 0, 'B', 0, 1, 0 } };
        try t.expectError(error.LimitExceeded, table.readObserved16(&reader));
        try t.expectEqual(@as(usize, 0), reader.offset);
        try t.expectEqual(@as(u32, 1), table.definitions.count());
        try t.expectEqual(@as(usize, 2), table.name_bytes);
    }
    var table = Table.init(t.allocator, .{ .max_name_bytes = 1 });
    defer table.deinit();
    var reader: Reader = .{ .bytes = &.{ 0, 0, 0, 0, 2, 0, 'A', 0, 1, 0 } };
    try t.expectError(error.LimitExceeded, table.readObserved16(&reader));
    table.options.max_name_bytes = 2;
    reader.bytes = &.{ 0, 0, 0, 0, 2, 0, 'A', 1, 1, 0 };
    try t.expectError(error.InvalidChartTypeName, table.readObserved16(&reader));
    try t.expectEqual(@as(usize, 0), reader.offset);
    try t.expectEqual(@as(u32, 0), table.definitions.count());
    try t.expectEqual(@as(usize, 0), table.name_bytes);
}
