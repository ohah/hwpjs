const std = @import("std");
const t = std.testing;
const d = @import("reader.zig");
const resources = @import("resources.zig");
test "track author level validation is atomic while payload remains opaque" {
    var b = [_]u8{0xff} ** 6;
    for ([_]u32{ 0, 1, 2, 1023 }) |level| {
        std.mem.writeInt(u32, b[0..4], 97 | (level << 10) | (2 << 20), .little);
        var it = try d.Iterator.init(&b, .{ .raw = 0x05010001 }, .{});
        if (level == 1) {
            const r = (try it.next()).?;
            try t.expect(r.value == .unknown);
            try t.expectEqualSlices(u8, b[4..], r.framing.payload);
            try t.expectEqual(null, try it.next());
        } else {
            try t.expectError(error.InvalidDocInfoLevel, it.next());
            try t.expectError(error.InvalidDocInfoLevel, it.next());
        }
    }
}
test "track author count uses actual slot presence across old and new versions" {
    var b = [_]u8{0} ** 82;
    std.mem.writeInt(u32, b[0..4], 17 | (72 << 20), .little);
    std.mem.writeInt(u32, b[76..80], 97 | (1 << 10) | (2 << 20), .little);
    for ([_]u32{ 0x05000107, 0x05000302, 0x05010001 }) |version| {
        for ([_]i32{ -1, 0, 1, 2, 0x7fffffff }) |n| {
            std.mem.writeInt(i32, b[72..76], n, .little);
            const r = try resources.inspect(&b, .{ .raw = version }, .{});
            try t.expectEqual(1, r.track_change_author_count);
            if (n == 1) try r.validateKnownCounts() else try t.expectError(if (n < 0) error.NegativeMappingCount else error.ResourceCountMismatch, r.validateKnownCounts());
        }
        std.mem.writeInt(i32, b[72..76], 0, .little);
        try (try resources.inspect(b[0..76], .{ .raw = version }, .{})).validateKnownCounts();
        var absent = b[0..72].* ++ b[76..82].*;
        std.mem.writeInt(u32, absent[0..4], 17 | (68 << 20), .little);
        const r = try resources.inspect(&absent, .{ .raw = version }, .{});
        try t.expectEqual(null, r.mappings.get(.track_change_author));
        try t.expectEqual(1, r.track_change_author_count);
        try r.validateKnownCounts();
    }
}
