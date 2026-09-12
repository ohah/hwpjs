const std = @import("std");
const t = std.testing;
const prelude = @import("grid_prelude.zig");

fn fixture() [144]u8 {
    var bytes = [_]u8{0xa5} ** 144;
    std.mem.writeInt(u32, bytes[32..36], 108, .little);
    std.mem.writeInt(u32, bytes[36..40], 0xfedcba98, .little);
    std.mem.writeInt(u32, bytes[56..60], 0x87654321, .little);
    const offsets = [_]usize{ 40, 60, 79, 96, 119 };
    const ids = [_]u32{ 300, 4, 2, 0xffffffff, 0 };
    inline for (.{ "VtChart\x00", "VtDataGrid\x00", "VtMatrix\x00", "VtCollection\x00", "VtObject\x00" }, 0..) |name, i| {
        const at = offsets[i];
        std.mem.writeInt(u32, bytes[at..][0..4], ids[i], .little);
        std.mem.writeInt(u16, bytes[at + 4 ..][0..2], name.len, .little);
        @memcpy(bytes[at + 6 ..][0..name.len], name);
        std.mem.writeInt(u16, bytes[at + 6 + name.len ..][0..2], if (i == 0) 6 else 1, .little);
    }
    std.mem.writeInt(u16, bytes[117..119], 19, .little);
    std.mem.writeInt(u16, bytes[136..138], 3, .little);
    std.mem.writeInt(u16, bytes[138..140], 4, .little);
    return bytes;
}

fn success(a: std.mem.Allocator) !void {
    var bytes = fixture();
    var result = try prelude.readObservedV6(a, &bytes, .{ .max_bytes = bytes.len, .max_cells = 12 });
    defer result.deinit();
    try t.expectEqualSlices(u8, bytes[0..36], &result.prefix);
    bytes[0] = 0;
    bytes[46] = 'X';
    try t.expectEqual(@as(u8, 0xa5), result.prefix[0]);
    try t.expectEqualStrings("VtChart\x00", result.types.definitions.get(300).?.raw_name);
    try t.expectEqual(@as(u32, 0xfedcba98), result.root_prefix);
    try t.expectEqual(@as(u32, 0x87654321), result.grid_prefix);
    try t.expectEqual(@as(u16, 19), result.collection_prefix);
    try t.expectEqual(@as(u16, 3), result.rows);
    try t.expectEqual(@as(u16, 4), result.columns);
    try t.expectEqual(@as(usize, 140), result.payload_offset);
    try t.expectEqual(@as(u32, 5), result.types.definitions.count());
    try t.expectEqual(@as(usize, 50), result.types.name_bytes);
}

fn rejected(a: std.mem.Allocator, bytes: []const u8, options: prelude.Options, expected: anyerror) !void {
    var result = prelude.readObservedV6(a, bytes, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    defer result.deinit();
    return error.ExpectedPreludeRejection;
}

test "chart grid prelude owns metadata and leaves cell data unread" {
    try success(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, success, .{});
}

test "chart grid prelude cuts versions names and late quotas clean up" {
    for (0..140) |cut| {
        var bytes = fixture();
        if (cut >= 36) std.mem.writeInt(u32, bytes[32..36], @intCast(cut - 36), .little);
        try rejected(t.allocator, bytes[0..cut], .{}, error.UnexpectedEnd);
    }
    const original = fixture();
    for ([_]prelude.Options{ .{ .max_bytes = 143 }, .{ .max_cells = 11 }, .{ .types = .{ .max_types = 4 } }, .{ .types = .{ .max_total_name_bytes = 49 } } }) |options| {
        try t.checkAllAllocationFailures(t.allocator, rejected, .{ &original, options, error.LimitExceeded });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("chart prelude leak");
        try rejected(gpa.allocator(), &original, options, error.LimitExceeded);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
    var bytes = original;
    bytes[32] ^= 1;
    try rejected(t.allocator, &bytes, .{}, error.InvalidChartExtent);
    bytes = original;
    bytes[125] = 'X';
    try t.checkAllAllocationFailures(t.allocator, rejected, .{ &bytes, prelude.Options{}, error.UnsupportedChartClass });
    bytes = original;
    bytes[134] = 2;
    try t.checkAllAllocationFailures(t.allocator, rejected, .{ &bytes, prelude.Options{}, error.UnsupportedChartTypeVersion });
}

test "chart grid prelude zero singleton and maximum dimensions are raw values" {
    for ([_]u16{ 0, 1, 65535 }) |rows| for ([_]u16{ 0, 1, 65535 }) |columns| {
        var bytes = fixture();
        std.mem.writeInt(u16, bytes[136..138], rows, .little);
        std.mem.writeInt(u16, bytes[138..140], columns, .little);
        const cells = @as(u32, rows) * columns;
        var result = try prelude.readObservedV6(t.allocator, &bytes, .{ .max_cells = cells });
        defer result.deinit();
        try t.expectEqual(rows, result.rows);
        try t.expectEqual(columns, result.columns);
        if (cells != 0) try rejected(t.allocator, &bytes, .{ .max_cells = cells - 1 }, error.LimitExceeded);
    };
}

test "chart grid prelude rejects each class version and aliased type without marker fallback" {
    const names = [_]usize{ 46, 66, 85, 102, 125 };
    const versions = [_]usize{ 54, 77, 94, 115, 134 };
    for (names, versions) |name, version| {
        var bytes = fixture();
        bytes[name] = 'X';
        try rejected(t.allocator, &bytes, .{}, error.UnsupportedChartClass);
        bytes = fixture();
        bytes[version] ^= 1;
        try rejected(t.allocator, &bytes, .{}, error.UnsupportedChartTypeVersion);
    }
    var bytes = fixture();
    std.mem.writeInt(u32, bytes[60..64], 300, .little);
    try rejected(t.allocator, &bytes, .{}, error.UnsupportedChartClass);
    var with_later_marker: [160]u8 = undefined;
    @memcpy(with_later_marker[0..144], &fixture());
    @memset(with_later_marker[144..], 0);
    @memcpy(with_later_marker[144..152], "VtChart\x00");
    std.mem.writeInt(u32, with_later_marker[32..36], 124, .little);
    with_later_marker[46] = 'X';
    try rejected(t.allocator, &with_later_marker, .{}, error.UnsupportedChartClass);
}
