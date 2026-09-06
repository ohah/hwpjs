const std = @import("std");
const t = std.testing;
const memo = @import("memo_shape.zig");
test "memo DocInfo dispatch is atomic for every short payload and wrong level" {
    const d = @import("reader.zig");
    var b = [_]u8{0} ** 26;
    for (0..22) |n| {
        std.mem.writeInt(u32, b[0..4], 92 | (1 << 10) | (@as(u32, @intCast(n)) << 20), .little);
        var it = try d.Iterator.init(b[0 .. n + 4], .{ .raw = 0x05000107 }, .{});
        try t.expectError(error.UnexpectedEnd, it.next());
        try t.expectError(error.UnexpectedEnd, it.next());
    }
    for ([_]u32{ 0, 1, 2, 1023 }) |level| {
        std.mem.writeInt(u32, b[0..4], 92 | (level << 10) | (22 << 20), .little);
        var it = try d.Iterator.init(&b, .{ .raw = 0x05010001 }, .{});
        if (level == 1) {
            try t.expect((try it.next()).?.value == .memo_shape);
            try t.expectEqual(null, try it.next());
        } else {
            try t.expectError(error.InvalidDocInfoLevel, it.next());
            try t.expectError(error.InvalidDocInfoLevel, it.next());
        }
    }
}
test "memo mapping count distinguishes absent zero negative and mismatch across versions" {
    const resources = @import("resources.zig");
    var b = [_]u8{0} ** 94;
    std.mem.writeInt(u32, b[0..4], 17 | (64 << 20), .little);
    std.mem.writeInt(u32, b[68..72], 92 | (1 << 10) | (22 << 20), .little);
    for ([_]u32{ 0x05000107, 0x05000201, 0x05010001 }) |version| {
        for ([_]i32{ -1, 0, 1, 2, 0x7fffffff }) |n| {
            std.mem.writeInt(i32, b[64..68], n, .little);
            const report = try resources.inspect(&b, .{ .raw = version }, .{});
            try t.expectEqual(1, report.memo_shape_count);
            if (n == 1) try report.validateKnownCounts() else try t.expectError(if (n < 0) error.NegativeMappingCount else error.ResourceCountMismatch, report.validateKnownCounts());
        }
        std.mem.writeInt(u32, b[64..68], 0, .little);
        try (try resources.inspect(b[0..68], .{ .raw = version }, .{})).validateKnownCounts();
        const absent = b[0..64].* ++ b[68..94].*;
        var old = absent;
        std.mem.writeInt(u32, old[0..4], 17 | (60 << 20), .little);
        const report = try resources.inspect(&old, .{ .raw = version }, .{});
        try t.expectEqual(null, report.mappings.get(.memo_shape));
        try t.expectEqual(1, report.memo_shape_count);
        try report.validateKnownCounts(); // Absence is not a declaration of zero.
    }
}
test "memo shape preserves distinct fields high bits unknown DWORD and extra" {
    var b = [_]u8{0} ** 25;
    std.mem.writeInt(u32, b[0..4], 0xffffffff, .little);
    b[4] = 255;
    b[5] = 128;
    for ([_]u32{ 0x81234567, 0x89abcdef, 0xfedcba98, 0x80000002 }, 0..) |v, i| std.mem.writeInt(u32, b[6 + i * 4 ..][0..4], v, .little);
    @memcpy(b[22..], &[_]u8{ 9, 128, 255 });
    const p = try memo.Shape.parse(&b);
    try t.expectEqual(0xffffffff, p.width);
    try t.expectEqual(255, p.border.kind);
    try t.expectEqual(128, p.border.width);
    try t.expectEqual(0x81234567, p.border.color);
    try t.expectEqual(0x89abcdef, p.fill_color);
    try t.expectEqual(0xfedcba98, p.active_color);
    try t.expectEqual(0x80000002, p.unknown_raw);
    try t.expectEqualSlices(u8, b[22..], p.extra);
    try t.expectEqual(b[22..].ptr, p.extra.ptr);
    for (0..22) |cut| try t.expectError(error.UnexpectedEnd, memo.Shape.parse(b[0..cut]));
    for (22..26) |end| try t.expectEqual(end - 22, (try memo.Shape.parse(b[0..end])).extra.len);
}
test "shared six-byte border read fails atomically from a nonzero cursor" {
    const b = [_]u8{255} ** 7;
    for (1..7) |end| {
        var r: @import("../../binary/reader.zig").Reader = .{ .bytes = b[0..end], .offset = 1 };
        try t.expectError(error.UnexpectedEnd, @import("border_line.zig").Border.read(&r));
        try t.expectEqual(1, r.offset);
    }
    var r: @import("../../binary/reader.zig").Reader = .{ .bytes = &b, .offset = 1 };
    try t.expectEqual(0xffffffff, (try @import("border_line.zig").Border.read(&r)).color);
    try t.expectEqual(7, r.offset);
}
