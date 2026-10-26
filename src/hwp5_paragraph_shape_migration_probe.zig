const std = @import("std");
const codec = @import("hwp5/edit/paragraph_shape_migration.zig");
const Shape = @import("hwp5/docinfo/para_shape.zig").ParaShape;

fn effective(shape: Shape) @import("model/document.zig").ParagraphSpacing {
    return @import("hwp5/edit/paragraph_spacing_values.zig").effective(.{
        .legacy_spacing_kind = shape.attributes & 3,
        .legacy_spacing = shape.legacy_spacing,
        .modern_spacing = shape.modern_spacing,
    });
}

test "paragraph shape migration preserves actual twelve source styles and spacing without file writes" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const before = try a.dupe(u8, info);
    defer a.free(before);
    var iterator = @import("hwp5/record.zig").Iterator.init(info, .{});
    var count: usize = 0;
    while (try iterator.next()) |record| {
        if (record.tag != 25) continue;
        try std.testing.expectEqual(@as(usize, 46), record.payload.len);
        const prior = try Shape.parse(record.payload, source.header.version());
        const output = try codec.prepare(a, record.payload, source.header.version(), .{ .raw = 0x05000300 }, null, 54);
        defer a.free(output);
        var expected: [54]u8 = undefined;
        @memcpy(expected[0..46], record.payload);
        std.mem.writeInt(u32, expected[46..50], std.mem.readInt(u32, record.payload[0..4], .little) & 3, .little);
        @memcpy(expected[50..54], record.payload[24..28]);
        try std.testing.expectEqualSlices(u8, &expected, output);
        const migrated = try Shape.parse(output, .{ .raw = 0x05000300 });
        try std.testing.expectEqualDeep(effective(prior), effective(migrated));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 12), count);
    try std.testing.expectEqualSlices(u8, before, info);
    try std.testing.expectEqual(@as(u32, 0x05000107), source.header.version().raw);
}

test "paragraph shape migration retains zero negative values neighboring bits and explicit absence" {
    const a = std.testing.allocator;
    for ([_]u32{ 0x05000000, 0x05000107 }) |version| for (0..3) |kind| for ([_]i32{ 0, 160, -720, std.math.minInt(i32), std.math.maxInt(i32) }) |value| {
        var raw: [46]u8 = undefined;
        for (&raw, 0..) |*byte, index| byte.* = @truncate(index * 37 + 11);
        std.mem.writeInt(u32, raw[0..4], (0xa5a55a5a & ~@as(u32, 3)) | @as(u32, @intCast(kind)), .little);
        std.mem.writeInt(i32, raw[24..28], value, .little);
        const length: usize = if (version == 0x05000000) 42 else 46;
        const default: ?u32 = if (length == 42) 0 else null;
        const output = try codec.prepare(a, raw[0..length], .{ .raw = version }, .{ .raw = 0x05000300 }, default, 54);
        defer a.free(output);
        try std.testing.expectEqualSlices(u8, raw[0..length], output[0..length]);
        try std.testing.expectEqual(@as(u32, @intCast(kind)), std.mem.readInt(u32, output[46..50], .little));
        try std.testing.expectEqual(value, std.mem.readInt(i32, output[50..54], .little));
        try std.testing.expectEqualDeep(effective(try Shape.parse(raw[0..length], .{ .raw = version })), effective(try Shape.parse(output, .{ .raw = 0x05000300 })));
    };
    var raw: [46]u8 = @splat(0);
    try std.testing.expectError(error.MissingParagraphMigrationDefault, codec.prepare(a, raw[0..42], .{ .raw = 0x05000000 }, .{ .raw = 0x05000300 }, null, 54));
    try std.testing.expectError(error.UnexpectedParagraphMigrationDefault, codec.prepare(a, &raw, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, 0, 54));
    raw[0] = 3;
    try std.testing.expectError(error.UnsupportedLegacyParagraphSpacing, codec.prepare(a, &raw, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, null, 54));
}

test "paragraph shape migration rejects opaque tails and handles all allocation failures" {
    const a = std.testing.allocator;
    const raw: [54]u8 = @splat(0);
    try std.testing.expectError(error.UnsupportedParagraphMigrationTail, codec.prepare(a, &raw, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, null, 54));
    try std.testing.expectError(error.LimitExceeded, codec.prepare(a, raw[0..46], .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, null, 53));
    const copied = try codec.prepare(a, &raw, .{ .raw = 0x05000300 }, .{ .raw = 0x05000300 }, null, 54);
    defer a.free(copied);
    try std.testing.expectEqualSlices(u8, &raw, copied);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const migrated = try codec.prepare(allocator, bytes, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, null, 54);
            defer allocator.free(migrated);
            try std.testing.expectEqualSlices(u8, bytes, migrated[0..bytes.len]);
        }
    }.run, .{raw[0..46]});
}
