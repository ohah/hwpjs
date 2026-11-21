const std = @import("std");
const wire = @import("original_cell_insets_wire.zig");
const model = @import("../model/original_cell_insets.zig");
test "original cell insets wire sparse zero inherited and u32 decoding boundaries" {
    const a = std.testing.allocator;
    const inherit = try wire.decode(a, "{\"lease\":\"18446744073709551615\",\"patch\":{\"mode\":\"inherit\"}}");
    try std.testing.expectEqual(std.math.maxInt(u64), inherit.lease);
    try std.testing.expect(inherit.patch == .inherit);
    const sparse = try wire.decode(a, "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":0,\"bottom\":32767}}");
    try std.testing.expectEqualDeep([4]?u32{ 0, null, null, 32767 }, sparse.patch.custom);
    const empty = try wire.decode(a, "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\"}}");
    try std.testing.expectEqualDeep([4]?u32{ null, null, null, null }, empty.patch.custom);
    const large = try wire.decode(a, "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":4294967295}}");
    try std.testing.expectEqual(@as(?u32, std.math.maxInt(u32)), large.patch.custom[0]);
    try std.testing.expectError(error.UnsupportedCellInsets, model.prepare(.{ .use_cell = false, .cell = .{ 10, 20, 30, 40 }, .table = .{ 144, 288, 432, 576 } }, .{ .width = 10000, .height = 4000 }, large.patch));
}
test "original cell insets wire rejects null unknown duplicate coercion and overflow" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "{\"lease\":1,\"patch\":{\"mode\":\"inherit\"}}",
        "{\"lease\":[49],\"patch\":{\"mode\":\"inherit\"}}",
        "{\"lease\":\"01\",\"patch\":{\"mode\":\"inherit\"}}",
        "{\"lease\":\"0\",\"patch\":{\"mode\":\"inherit\"}}",
        "{\"lease\":\"18446744073709551616\",\"patch\":{\"mode\":\"inherit\"}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":null}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":\"0\"}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":0.0}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":false}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":-1}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":4294967296}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"inherit\",\"left\":0}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"other\":0}}",
        "{\"lease\":\"1\",\"extra\":0,\"patch\":{\"mode\":\"inherit\"}}",
        "{\"lease\":\"1\",\"lease\":\"2\",\"patch\":{\"mode\":\"inherit\"}}",
        "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":0,\"left\":1}}",
        "{\"lease\":\"\xff\",\"patch\":{\"mode\":\"inherit\"}}",
    }) |input| {
        if (wire.decode(a, input)) |_| return error.ExpectedWireRejection else |err| {
            if (err == error.OutOfMemory) return err;
        }
    }
}
test "original cell insets wire exact four axes projection and readonly never issues lease" {
    const a = std.testing.allocator;
    const source: model.Source = .{ .use_cell = false, .cell = .{ 10, 20, 30, 40 }, .table = .{ 144, 288, 432, 576 } };
    const frame: model.Frame = .{ .width = 10000, .height = 4000 };
    for ([_]bool{ false, true }) |readonly| {
        const bytes = try wire.observation(a, "hwpx", 0, 1, 2, 3, if (readonly) null else 7, 4, source, frame, readonly);
        defer a.free(bytes);
        var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
        defer parsed.deinit();
        const row = parsed.value.object;
        try std.testing.expectEqual(!readonly, row.get("editable").?.bool);
        try std.testing.expectEqual(@as(usize, 4), row.get("effective").?.array.items.len);
        try std.testing.expectEqual(@as(usize, 4), row.get("tableDefaults").?.array.items.len);
        for ([_]i64{ 144, 288, 432, 576 }, 0..) |value, i| {
            try std.testing.expectEqual(value, row.get("effective").?.array.items[i].integer);
            try std.testing.expectEqual(value, row.get("tableDefaults").?.array.items[i].integer);
        }
        if (readonly) try std.testing.expect(row.get("lease").? == .null) else try std.testing.expectEqualStrings("7", row.get("lease").?.string);
    }
    try std.testing.expectError(error.InvalidOriginalCellLease, wire.observation(a, "hwp5", 0, 1, 2, 3, 7, 4, source, frame, true));
    try std.testing.expectError(error.InvalidOriginalCellLease, wire.observation(a, "hwp5", 0, 1, 2, 3, null, 4, source, frame, false));
}
test "original cell insets wire semantic upper bound and incomplete source fail closed" {
    const a = std.testing.allocator;
    const source: model.Source = .{ .use_cell = false, .cell = .{ 10, 20, 30, 40 }, .table = .{ 144, 288, 432, 576 } };
    const frame: model.Frame = .{ .width = 100000, .height = 100000 };
    const edge = try wire.decode(a, "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":32767}}");
    try std.testing.expectEqual(@as(u32, 32767), (try model.prepare(source, frame, edge.patch)).effective[0]);
    const outside = try wire.decode(a, "{\"lease\":\"1\",\"patch\":{\"mode\":\"custom\",\"left\":32768}}");
    try std.testing.expectError(error.UnsupportedCellInsets, model.prepare(source, frame, outside.patch));
    var incomplete = source;
    incomplete.table[0] = null;
    try std.testing.expectError(error.UnknownCellInsets, wire.observation(a, "hwpx", 0, 1, 2, 3, 1, 0, incomplete, frame, false));
    try std.testing.expectError(error.InvalidOriginalCellLease, wire.observation(a, "hwpx", 0, 1, 2, 3, 0, 0, source, frame, false));
    const oversized: [wire.max_request_bytes + 1]u8 = @splat(' ');
    try std.testing.expectError(error.LimitExceeded, wire.decode(a, &oversized));
}
