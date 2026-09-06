const std = @import("std");
const t = std.testing;
const rendering = @import("rendering.zig");
const Component = @import("shape_component.zig").Component;
test "matrix raw IEEE bits and failed reads preserve data and cursor" {
    const values = [_]u64{ 0x8000000000000000, 0x7ff8000000000042, 0x7ff0000000000000, 0xfff0000000000000, 0x3ff0000000000000, 1 };
    var raw: [48]u8 = undefined;
    inline for (values, 0..) |v, i| std.mem.writeInt(u64, raw[i * 8 ..][0..8], v, .little);
    var r: @import("../../binary/reader.zig").Reader = .{ .bytes = &raw };
    const m = try rendering.Matrix.read(&r);
    try t.expectEqualSlices(u64, &values, &m.bits);
    try t.expectEqual(@as(f64, 1), m.value(4).?);
    try t.expectEqual(null, m.value(6));
    r.offset = 0;
    try t.expectError(error.UnexpectedEnd, rendering.Pair.read(&r));
    try t.expectEqual(0, r.offset);
    for (0..48) |n| {
        var short: @TypeOf(r) = .{ .bytes = raw[0..n] };
        try t.expectError(error.UnexpectedEnd, rendering.Matrix.read(&short));
        try t.expectEqual(0, short.offset);
    }
    var empty: @TypeOf(r) = .{ .bytes = &.{ 1, 0 } };
    try t.expectError(error.UnexpectedEnd, rendering.Rendering.read(&empty));
    try t.expectEqual(0, empty.offset);
    var incomplete = [_]u8{0} ** 50;
    incomplete[0] = 1;
    var pair_missing: @TypeOf(r) = .{ .bytes = &incomplete };
    try t.expectError(error.UnexpectedEnd, rendering.Rendering.read(&pair_missing));
    try t.expectEqual(0, pair_missing.offset);
}
test "shape component explicit identity count and bounded matrix pairs" {
    var raw = [_]u8{0} ** 197;
    std.mem.writeInt(u32, raw[0..4], 0x246f6c65, .little);
    std.mem.writeInt(u32, raw[4..8], 0x12345678, .little);
    std.mem.writeInt(i32, raw[8..12], -2147483648, .little);
    std.mem.writeInt(u32, raw[20..24], 0xffffffff, .little);
    std.mem.writeInt(u32, raw[36..40], 0xffffffff, .little);
    std.mem.writeInt(i16, raw[40..42], -32768, .little);
    std.mem.writeInt(u16, raw[50..52], 1, .little);
    raw[196] = 9;
    const p = try Component.parse(&raw, .double_id);
    try t.expectEqual(0x12345678, p.second_id.?);
    try t.expectEqual(-2147483648, p.offset_x);
    try t.expectEqual(0xffffffff, p.original_width);
    try t.expectEqual(-32768, p.rotation_angle);
    try t.expect(p.horizontalFlip() and p.verticalFlip());
    try t.expectEqual(1, p.rendering.pairs.count());
    try t.expectEqual(null, p.rendering.pairs.get(1));
    try t.expectEqual(null, p.rendering.pairs.get(std.math.maxInt(usize)));
    try t.expectEqualSlices(u8, &.{9}, p.extra);
    for (0..196) |n| try t.expectError(error.UnexpectedEnd, Component.parse(raw[0..n], .double_id));
    // Single-ID layout must not skip offset_x even when it happens to equal the ID.
    @memset(&raw, 0);
    std.mem.writeInt(u32, raw[0..4], 0x246f6c65, .little);
    std.mem.writeInt(u32, raw[4..8], 0x246f6c65, .little);
    const single = try Component.parse(raw[0..96], .single_id);
    try t.expectEqual(null, single.second_id);
    try t.expectEqual(0x246f6c65, single.offset_x);
    try t.expectEqual(0, single.rendering.pairs.count());
}
fn allocationCase(a: std.mem.Allocator, bad: bool) !void {
    var raw = [_]u8{0} ** 112;
    std.mem.writeInt(u32, raw[0..4], 71 | (4 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], @import("control_rules.zig").drawing_id, .little);
    std.mem.writeInt(u32, raw[8..12], 76 | (1 << 10) | (100 << 20), .little);
    var tree = try @import("tree.zig").Tree.parse(a, raw[0..if (bad) 8 else 112], .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = @import("shape_validation.zig").inspect(tree);
    if (bad) try t.expectError(error.MissingShapeComponent, result) else try t.expectEqual(1, (try result).components);
}
test "shape hierarchy cleanup includes missing component" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{false});
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{true});
}
