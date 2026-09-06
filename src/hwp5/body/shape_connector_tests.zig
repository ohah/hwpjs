const std = @import("std");
const t = std.testing;
const c = @import("shape_connector.zig");
test "connector preserves all fields and borrowed points without truncation repair" {
    var b = [_]u8{0} ** 64;
    const values = [_]u32{ 0x80000000, 17, 0xffffffff, 0x7fffffff, 0xdeadbeef, 19, 23, 29, 31, 2 };
    for (values, 0..) |value, i| std.mem.writeInt(u32, b[i * 4 ..][0..4], value, .little);
    std.mem.writeInt(i32, b[40..44], -79, .little);
    std.mem.writeInt(i32, b[44..48], 53, .little);
    std.mem.writeInt(u16, b[48..50], 65535, .little);
    @memcpy(b[60..64], &[_]u8{ 9, 0, 128, 255 });
    const p = try c.Connector.parse(&b);
    try t.expectEqual(std.math.minInt(i32), p.start.x);
    try t.expectEqual(17, p.start.y);
    try t.expectEqual(-1, p.end.x);
    try t.expectEqual(std.math.maxInt(i32), p.end.y);
    try t.expectEqual(0xdeadbeef, p.kind_raw);
    try t.expectEqual(19, p.start_subject_id);
    try t.expectEqual(23, p.start_subject_index);
    try t.expectEqual(29, p.end_subject_id);
    try t.expectEqual(31, p.end_subject_index);
    try t.expectEqual(2, p.points.count());
    try t.expectEqual(-79, p.points.get(0).?.position.x);
    try t.expectEqual(53, p.points.get(0).?.position.y);
    try t.expectEqual(65535, p.points.get(0).?.kind_raw);
    try t.expectEqual(0, p.points.get(1).?.position.x);
    try t.expectEqual(null, p.points.get(2));
    try t.expectEqual(b[40..].ptr, p.points.raw.ptr);
    try t.expectEqualSlices(u8, b[60..], p.extra);
    for (0..60) |cut| try t.expectError(error.UnexpectedEnd, c.Connector.parse(b[0..cut]));
    for ([_]u32{ 3, 0x80000000, 0xffffffff }) |count| {
        std.mem.writeInt(u32, b[36..40], count, .little);
        try t.expectError(error.UnexpectedEnd, c.Connector.parse(&b));
    }
    std.mem.writeInt(u32, b[36..40], 0, .little);
    try t.expectEqual(0, (try c.Connector.parse(b[0..40])).points.count());
}
test "connector point reads preserve nonzero cursor on every truncation" {
    const b = [_]u8{255} ** 11;
    for (1..11) |end| {
        var r: @import("../../binary/reader.zig").Reader = .{ .bytes = b[0..end], .offset = 1 };
        try t.expectError(error.UnexpectedEnd, c.ControlPoint.read(&r));
        try t.expectEqual(1, r.offset);
    }
    var r: @import("../../binary/reader.zig").Reader = .{ .bytes = &b, .offset = 1 };
    try t.expectEqual(-1, (try c.ControlPoint.read(&r)).position.x);
    try t.expectEqual(11, r.offset);
}
