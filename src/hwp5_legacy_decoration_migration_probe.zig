const std = @import("std");
const codec = @import("hwp5/edit/legacy_decoration_migration.zig");
const Shape = @import("hwp5/docinfo/char_shape.zig").CharShape;

test "legacy decoration migration prepares actual shape without claiming document conversion" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    try std.testing.expectEqual(@as(u32, 0x05000107), source.header.version().raw);
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    var iterator = @import("hwp5/record.zig").Iterator.init(info, .{});
    var index: usize = 0;
    var payload: ?[]const u8 = null;
    while (try iterator.next()) |record| {
        if (record.tag != 21) continue;
        if (index == 9) payload = record.payload;
        index += 1;
    }
    const raw = payload orelse return error.MissingFixtureCharacterShape;
    try std.testing.expectEqual(@as(usize, 68), raw.len);
    const migrated = try codec.prepare(a, raw, source.header.version(), .{ .raw = 0x05000300 }, 0, 74);
    defer a.free(migrated);
    var wire_expected: [74]u8 = undefined;
    @memcpy(wire_expected[0..68], raw);
    const prior_flags = std.mem.readInt(u32, raw[46..50], .little);
    std.mem.writeInt(u32, wire_expected[46..50], (prior_flags & ~@as(u32, 12 | 7 << 18 | 15 << 26)) | (1 << 18) | (((prior_flags >> 4) & 15) << 26), .little);
    wire_expected[68..70].* = .{ 0, 0 };
    @memcpy(wire_expected[70..74], raw[56..60]);
    try std.testing.expectEqualSlices(u8, &wire_expected, migrated);
    const parsed = try Shape.parse(migrated, .{ .raw = 0x05000300 });
    try std.testing.expectEqual(@as(u2, 0), parsed.underlineKindRaw());
    try std.testing.expectEqual(@as(u3, 1), parsed.strikeKindRaw());
    try std.testing.expectEqual(@as(?u16, 0), parsed.border_fill_id);
    try std.testing.expectEqual(std.mem.readInt(u32, raw[56..60], .little), parsed.strike_color.?);
    const colored = try @import("hwp5/edit/character_property_payload.zig").write(a, migrated, .{ .raw = 0x05000300 }, .{ .underline_color = 0x123456 }, 74);
    defer a.free(colored);
    var expected: [74]u8 = undefined;
    @memcpy(&expected, migrated);
    expected[56..60].* = .{ 0x12, 0x34, 0x56, 0 };
    try std.testing.expectEqualSlices(u8, &expected, colored);
    try std.testing.expectEqualSlices(u8, before, input);
    try std.testing.expectEqual(@as(u32, 0x05000107), source.header.version().raw);
    try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, @import("hwp5/edit/character_property_payload.zig").write(a, raw, source.header.version(), .{ .underline_color = 0x123456 }, 74));
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: []const u8, wanted: []const u8) !void {
            const bytes = try codec.prepare(allocator, original, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, 0, 74);
            defer allocator.free(bytes);
            try std.testing.expectEqualSlices(u8, wanted, bytes);
        }
    }.run, .{ raw, @as([]const u8, &wire_expected) });
}

test "legacy decoration migration preserves every style color and neighboring bit and rejects unknown tails" {
    const a = std.testing.allocator;
    for (0..16) |style| {
        var raw: [68]u8 = @splat(0xa5);
        for (&raw, 0..) |*byte, offset| byte.* = @truncate(offset * 37 + 11);
        const flags = (0xa5a55a5a & ~@as(u32, 3 << 2 | 7 << 18 | 15 << 4)) | (2 << 2) | (@as(u32, @intCast(style)) << 4);
        std.mem.writeInt(u32, raw[46..50], flags, .little);
        const out = try codec.prepare(a, &raw, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, 7, 74);
        defer a.free(out);
        var expected: [74]u8 = undefined;
        @memcpy(expected[0..68], &raw);
        std.mem.writeInt(u32, expected[46..50], (flags & ~@as(u32, 12 | 7 << 18 | 15 << 26)) | (1 << 18) | (@as(u32, @intCast(style)) << 26), .little);
        expected[68..70].* = .{ 7, 0 };
        @memcpy(expected[70..74], raw[56..60]);
        try std.testing.expectEqualSlices(u8, &expected, out);
        try std.testing.expectError(error.MissingCharacterMigrationDefault, codec.prepare(a, &raw, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, null, 74));
        try std.testing.expectError(error.LimitExceeded, codec.prepare(a, &raw, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, 7, 73));
        var extended: [69]u8 = undefined;
        @memcpy(extended[0..68], &raw);
        extended[68] = 0;
        try std.testing.expectError(error.UnsupportedCharacterMigrationTail, codec.prepare(a, &extended, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, 0, 74));
        try std.testing.expectError(error.UnsupportedDecorationMigrationTarget, codec.prepare(a, &raw, .{ .raw = 0x05000107 }, .{ .raw = 0x05010100 }, 0, 74));
    }
}

test "legacy decoration migration retains existing border identity and refuses truncated or ambiguous inputs" {
    const a = std.testing.allocator;
    var raw: [74]u8 = @splat(0);
    std.mem.writeInt(u32, raw[46..50], (2 << 2) | (9 << 4), .little);
    raw[56..60].* = .{ 0x12, 0x34, 0x56, 0x80 };
    raw[68..70].* = .{ 17, 0 };
    raw[70..74].* = .{ 0xaa, 0xbb, 0xcc, 0xdd };
    const before = raw;
    for ([_]struct { version: u32, length: usize }{ .{ .version = 0x05000201, .length = 70 }, .{ .version = 0x05000300, .length = 74 } }) |profile| {
        const out = try codec.prepare(a, raw[0..profile.length], .{ .raw = profile.version }, .{ .raw = 0x05000300 }, null, 74);
        defer a.free(out);
        try std.testing.expectEqualSlices(u8, raw[68..70], out[68..70]);
        try std.testing.expectEqualSlices(u8, raw[56..60], out[70..74]);
        try std.testing.expectEqualSlices(u8, raw[0..46], out[0..46]);
        try std.testing.expectEqualSlices(u8, raw[50..68], out[50..68]);
        try std.testing.expectError(error.UnexpectedCharacterMigrationDefault, codec.prepare(a, raw[0..profile.length], .{ .raw = profile.version }, .{ .raw = 0x05000300 }, 0, 74));
        try std.testing.expectError(error.NotLegacyCharacterDecoration, codec.prepare(a, out, .{ .raw = 0x05000300 }, .{ .raw = 0x05000300 }, null, 74));
    }
    for (0..68) |length| try std.testing.expectError(error.UnexpectedEnd, codec.prepare(a, raw[0..length], .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, 0, 74));
    for ([_]usize{ 69, 71, 72, 73 }) |length| try std.testing.expectError(error.UnexpectedEnd, codec.prepare(a, raw[0..length], .{ .raw = 0x05000300 }, .{ .raw = 0x05000300 }, null, 74));
    try std.testing.expectError(error.UnsupportedDecorationMigrationTarget, codec.prepare(a, &raw, .{ .raw = 0x05010100 }, .{ .raw = 0x05000300 }, null, 74));
    try std.testing.expectEqualSlices(u8, &before, &raw);
}
