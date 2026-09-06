const std = @import("std");
const t = std.testing;
const info = @import("track_change_info.zig");
const d = @import("reader.zig");
const resources = @import("resources.zig");

test "track info envelope borrows core and odd extension and rejects every short prefix" {
    var bytes = [_]u8{0xaa} ** 1035;
    for (0..1032) |n| try t.expectError(error.UnexpectedEnd, info.View.parse(bytes[0..n]));
    const view = try info.View.parse(&bytes);
    try t.expectEqual(1032, view.core.len);
    try t.expectEqual(3, view.extra.len);
    try t.expect(view.core.ptr == bytes[0..].ptr);
    try t.expect(view.extra.ptr == bytes[1032..].ptr);
    bytes[1032] = 17;
    try t.expectEqual(17, view.extra[0]);
}

test "track envelope errors are atomic after an already consumed unknown record" {
    var b = [_]u8{0} ** 1040;
    std.mem.writeInt(u32, b[0..4], 999, .little);
    for ([_]u32{ 32, 96 }) |tag| {
        for ([_]u32{ 0, 1, 2, 1023 }) |level| {
            std.mem.writeInt(u32, b[4..8], tag | (level << 10) | (1032 << 20), .little);
            var it = try d.Iterator.init(&b, .{ .raw = 0x05010001 }, .{});
            try t.expectEqual(999, (try it.next()).?.framing.tag);
            if (level == 1) {
                const r = (try it.next()).?;
                try t.expect(r.value == .unknown);
                try t.expectEqualSlices(u8, b[8..], r.framing.payload);
                try t.expectEqual(null, try it.next());
            } else {
                try t.expectError(error.InvalidDocInfoLevel, it.next());
                try t.expectError(error.InvalidDocInfoLevel, it.next());
            }
        }
    }
    std.mem.writeInt(u32, b[4..8], 32 | (1 << 10) | (1031 << 20), .little);
    var it = try d.Iterator.init(b[0..1039], .{ .raw = 0x05000302 }, .{});
    _ = try it.next();
    try t.expectError(error.UnexpectedEnd, it.next());
    try t.expectError(error.UnexpectedEnd, it.next());
}

test "track content count distinguishes absent slot from signed declarations" {
    var b = [_]u8{0} ** 77;
    std.mem.writeInt(u32, b[0..4], 17 | (68 << 20), .little);
    std.mem.writeInt(u32, b[72..76], 96 | (1 << 10) | (1 << 20), .little);
    for ([_]u32{ 0x05000107, 0x05000301, 0x05000302, 0x05010001 }) |v| {
        for ([_]i32{ -1, 0, 1, 2, 0x7fffffff }) |n| {
            std.mem.writeInt(i32, b[68..72], n, .little);
            const report = try resources.inspect(&b, .{ .raw = v }, .{});
            try t.expectEqual(1, report.track_change_count);
            if (n == 1) try report.validateKnownCounts() else try t.expectError(if (n < 0) error.NegativeMappingCount else error.ResourceCountMismatch, report.validateKnownCounts());
        }
        std.mem.writeInt(i32, b[68..72], 0, .little);
        try (try resources.inspect(b[0..72], .{ .raw = v }, .{})).validateKnownCounts();
        var absent = b[0..68].* ++ b[72..77].*;
        std.mem.writeInt(u32, absent[0..4], 17 | (64 << 20), .little);
        const report = try resources.inspect(&absent, .{ .raw = v }, .{});
        try t.expectEqual(null, report.mappings.get(.track_change));
        try t.expectEqual(1, report.track_change_count);
        try report.validateKnownCounts();
    }
}
