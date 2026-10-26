const std = @import("std");
const codec = @import("hwp5/edit/character_strike_color_payload.zig");
const Shape = @import("hwp5/docinfo/char_shape.zig").CharShape;

test "strike color payload preserves every other byte across legacy and independent layouts" {
    const a = std.testing.allocator;
    for ([_]u32{ 0x05000107, 0x05000201, 0x05000300, 0x05010100 }) |raw| {
        for ([_]bool{ true, false }) |legacy| {
            var input: [79]u8 = @splat(0xa5);
            const flags: u32 = if (legacy) 2 << 2 | 7 << 4 else 1 << 18 | 3 << 2 | 7 << 26;
            std.mem.writeInt(u32, input[46..50], flags, .little);
            const length: usize = if (raw < 0x05000201) 68 else if (raw < 0x05000300) 70 else input.len;
            const version: @import("hwp5/version.zig").Version = .{ .raw = raw };
            if (!legacy and raw < 0x05000300) {
                try std.testing.expectError(error.MissingCharacterStrikeColorField, codec.write(a, input[0..length], version, 0x123456, 79));
                continue;
            }
            for ([_]u32{ 0, 0xffffff, 0x123456 }) |color| {
                const output = try codec.write(a, input[0..length], version, color, length);
                defer a.free(output);
                var expected = input;
                const offset: usize = if (legacy) 56 else 70;
                expected[offset..][0..4].* = .{ @intCast(color >> 16), @truncate(color >> 8), @truncate(color), 0 };
                try std.testing.expectEqualSlices(u8, expected[0..length], output);
                try std.testing.expectEqual(flags, (try Shape.parse(output, version)).attributes);
                try std.testing.expectEqualSlices(u8, input[0..46], output[0..46]);
            }
        }
    }
}

test "strike color payload rejects malformed absent and unknown sources and owns allocation failures" {
    const a = std.testing.allocator;
    var input: [79]u8 = @splat(0);
    const version: @import("hwp5/version.zig").Version = .{ .raw = 0x05000300 };
    for (0..68) |length| try std.testing.expectError(error.UnexpectedEnd, codec.write(a, input[0..length], version, 0, 79));
    for ([_]usize{ 69, 71, 72, 73 }) |length| try std.testing.expectError(error.UnexpectedEnd, codec.write(a, input[0..length], version, 0, 79));
    for ([_]usize{ 68, 70 }) |length| try std.testing.expectError(error.MissingCharacterStrikeColorField, codec.write(a, input[0..length], version, 0, 79));
    for (2..8) |kind| {
        std.mem.writeInt(u32, input[46..50], @as(u32, @intCast(kind)) << 18, .little);
        try std.testing.expectError(error.UnsupportedCharacterStrikeKind, codec.write(a, &input, version, 0, 79));
    }
    std.mem.writeInt(u32, input[46..50], 2 << 2, .little);
    try std.testing.expectError(error.InvalidCharacterColor, codec.write(a, &input, version, 0x1000000, 79));
    try std.testing.expectError(error.LimitExceeded, codec.write(a, &input, version, 0, 78));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const output = try codec.write(allocator, source, .{ .raw = 0x05000300 }, 0x123456, source.len);
            defer allocator.free(output);
            try std.testing.expectEqualSlices(u8, &.{ 0x12, 0x34, 0x56, 0 }, output[56..60]);
            try std.testing.expectEqualSlices(u8, source[60..], output[60..]);
        }
    }.run, .{&input});
}

test "strike color payload edits actual legacy resource without upgrading its file version" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    var iterator = @import("hwp5/record.zig").Iterator.init(info, .{});
    var index: usize = 0;
    var checked = false;
    while (try iterator.next()) |record| {
        if (record.tag != 21) continue;
        defer index += 1;
        if (index != 9) continue;
        const raw = record.payload;
        try std.testing.expectEqual(@as(usize, 68), raw.len);
        try std.testing.expectEqual(@as(u32, 0x05000107), source.header.version().raw);
        const shape = try Shape.parse(raw, source.header.version());
        try std.testing.expectEqual(@as(u2, 2), shape.underlineKindRaw());
        try std.testing.expectEqual(@as(u3, 0), shape.strikeKindRaw());
        const output = try codec.write(a, raw, source.header.version(), 0x123456, raw.len);
        defer a.free(output);
        var expected: [68]u8 = undefined;
        @memcpy(&expected, raw);
        expected[56..60].* = .{ 0x12, 0x34, 0x56, 0 };
        try std.testing.expectEqualSlices(u8, &expected, output);
        checked = true;
    }
    try std.testing.expect(checked);
    try std.testing.expectEqualSlices(u8, before, input);
}

test "strike color payload edits actual independent resources without changing underline color" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    var iterator = @import("hwp5/record.zig").Iterator.init(info, .{});
    var checked: usize = 0;
    while (try iterator.next()) |record| {
        if (record.tag != 21) continue;
        const shape = try Shape.parse(record.payload, source.header.version());
        if (shape.strikeKindRaw() != 1) continue;
        const output = try codec.write(a, record.payload, source.header.version(), 0x123456, record.payload.len);
        defer a.free(output);
        const expected = try a.dupe(u8, record.payload);
        defer a.free(expected);
        expected[70..74].* = .{ 0x12, 0x34, 0x56, 0 };
        try std.testing.expectEqualSlices(u8, expected, output);
        try std.testing.expectEqual(shape.underline_color, (try Shape.parse(output, source.header.version())).underline_color);
        checked += 1;
    }
    try std.testing.expectEqual(@as(usize, 3), checked);
}
