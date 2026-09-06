const std = @import("std");
const t = std.testing;
const b = @import("reader.zig");
test "metadata malformed dispatch is atomic for every row type" {
    for ([_]u32{ 68, 69, 70 }) |tag| {
        var bytes = [_]u8{0} ** 5;
        std.mem.writeInt(u32, bytes[0..4], tag | (1 << 20), .little);
        var it = try b.Iterator.init(&bytes, .{ .raw = 0x05000307 }, .{});
        for (0..2) |_| {
            try t.expectError(error.InvalidRecordArraySize, it.next());
            try t.expectEqual(0, it.records.reader.offset);
            try t.expectEqual(0, it.records.count);
        }
    }
}
test "metadata distinct signed fields and nonfirst run order" {
    var bytes: [36]u8 = undefined;
    for (0..9) |i| std.mem.writeInt(i32, bytes[i * 4 ..][0..4], -@as(i32, @intCast(i + 1)), .little);
    const line = (try b.Segments.parse(&bytes)).get(0).?;
    try t.expectEqual(0xffffffff, line.start);
    try t.expectEqual(-2, line.y);
    try t.expectEqual(-3, line.height);
    try t.expectEqual(-4, line.text_height);
    try t.expectEqual(-5, line.baseline);
    try t.expectEqual(-6, line.spacing);
    try t.expectEqual(-7, line.x);
    try t.expectEqual(-8, line.width);
    try t.expectEqual(0xfffffff7, line.flags);
    var raw = [_]u8{0} ** 22;
    raw[0] = 10;
    raw[12] = 3;
    const h = try b.Header.parse(&raw, .{ .raw = 0x05000107 });
    var runs = [_]u8{0} ** 24;
    runs[8] = 5;
    runs[16] = 4;
    const m: b.Metadata = .{ .runs = try b.Runs.parse(&runs) };
    try t.expectError(error.InvalidCharRunPosition, m.validate(h, 1));
    runs[16] = 5;
    try m.validate(h, 1);
    runs[16] = 10;
    try m.validate(h, 1);
}
test "metadata arrays reject partial rows, bounded get and signed wire fields" {
    inline for (.{ b.Runs, b.Segments, b.Ranges }, .{ 8, 36, 12 }) |T, width| {
        const bytes = [_]u8{255} ** (width * 2);
        for (0..bytes.len) |n| {
            if (n % width == 0) continue;
            try t.expectError(error.InvalidRecordArraySize, T.parse(bytes[0..n]));
        }
        const rows = try T.parse(&bytes);
        try t.expectEqual(2, rows.count());
        try t.expect(rows.get(2) == null and rows.get(std.math.maxInt(usize)) == null);
    }
    const line = (try b.Segments.parse(&([_]u8{255} ** 36))).get(0).?;
    try t.expectEqual(-1, line.y);
    try t.expectEqual(-1, line.spacing);
    try t.expectEqual(-1, line.width);
    try t.expectEqual(0xffffffff, line.flags);
    const range = (try b.Ranges.parse(&([_]u8{255} ** 12))).get(0).?;
    try t.expectEqual(255, range.kind());
    try t.expectEqual(0xffffff, range.data());
}
test "metadata count references positions and overlapping ranges" {
    var raw = [_]u8{0} ** 22;
    raw[0] = 10;
    raw[12] = 1;
    raw[14] = 2;
    raw[16] = 1;
    const h = try b.Header.parse(&raw, .{ .raw = 0x05000107 });
    var runs = [_]u8{0} ** 8;
    var lines = [_]u8{0} ** 36;
    var ranges = [_]u8{0} ** 24;
    ranges[4] = 8;
    ranges[12] = 2;
    ranges[16] = 10;
    const m: b.Metadata = .{ .runs = try b.Runs.parse(&runs), .lines = try b.Segments.parse(&lines), .ranges = try b.Ranges.parse(&ranges) };
    try m.validate(h, 1); // overlap [0,8] and [2,10] is allowed
    try t.expectError(error.InvalidResourceReference, m.validate(h, 0));
    runs[0] = 1;
    try t.expectError(error.InvalidCharRunPosition, m.validate(h, 1));
    runs[0] = 0;
    lines[0] = 11;
    try t.expectError(error.InvalidLinePosition, m.validate(h, 1));
    lines[0] = 0;
    ranges[12] = 11;
    try t.expectError(error.InvalidRangePosition, m.validate(h, 1));
    ranges[12] = 2;
    var missing = m;
    missing.ranges = null;
    try t.expectError(error.ParagraphMetadataCountMismatch, missing.validate(h, 1));
    try m.validate(h, 1);
}
