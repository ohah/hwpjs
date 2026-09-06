const std = @import("std");
const t = std.testing;
const d = @import("reader.zig");
const resources = @import("resources.zig");
const refs = @import("references.zig");
const rules = @import("reference_rules.zig");
const version = @import("../version.zig").Version{ .raw = 0x05000107 };
fn put(b: []u8, at: usize, comptime T: type, x: T) void {
    std.mem.writeInt(T, b[at..][0..@sizeOf(T)], x, .little);
}
fn frame(out: *std.ArrayList(u8), tag: u10, b: []const u8) !void {
    var h: [4]u8 = undefined;
    put(&h, 0, u32, @as(u32, tag) | (if (tag == 17) @as(u32, 0) else 1024) | (@as(u32, @intCast(b.len)) << 20));
    try out.appendSlice(t.allocator, &h);
    try out.appendSlice(t.allocator, b);
}
fn fixture() ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(t.allocator);
    var map = [_]u8{0} ** 60;
    for (0..15) |i| put(&map, i * 4, i32, 1);
    try frame(&out, 17, &map);
    try frame(&out, 18, &.{ 2, 0, 255, 255 }); // storage ID != 1-based BinData item index
    for (0..7) |_| try frame(&out, 19, &.{ 0, 0, 0 });
    var border = [_]u8{0} ** 46;
    put(&border, 32, u32, 2);
    border[36] = 5;
    put(&border, 40, u16, 1);
    try frame(&out, 20, &border);
    try frame(&out, 21, &([_]u8{0} ** 68));
    try frame(&out, 22, &([_]u8{0} ** 8));
    var numbering = [_]u8{0} ** 100;
    for (0..7) |i| put(&numbering, i * 14 + 8, u32, 0xffffffff);
    try frame(&out, 23, &numbering);
    var bullet = [_]u8{0} ** 25;
    put(&bullet, 8, u32, 0xffffffff);
    put(&bullet, 21, u16, 65535);
    try frame(&out, 24, &bullet);
    var para = [_]u8{0} ** 42;
    put(&para, 32, u16, 1);
    put(&para, 30, u16, 65535);
    try frame(&out, 25, &para); // inactive head ID
    try frame(&out, 26, &([_]u8{0} ** 12));
    return out.toOwnedSlice(t.allocator);
}
fn payload(bytes: []u8, tag: u10) ![]u8 {
    var it = try d.Iterator.init(bytes, version, .{});
    while (try it.next()) |r| if (r.framing.tag == tag) {
        return bytes[r.framing.offset + r.framing.raw.len - r.framing.payload.len ..][0..r.framing.payload.len];
    };
    return error.MissingTestRecord;
}
test "reference ID boundaries, optional sentinels and zero-based first item" {
    try t.expectEqual(@as(usize, 0), rules.resolve(.zero_based, 0, 1).ordinal);
    try t.expectEqual(@as(usize, 0), rules.resolve(.one_based, 1, 1).ordinal);
    try t.expect(rules.resolve(.zero_based, 1, 1) == .invalid);
    try t.expect(rules.resolve(.one_based, 0, 1) == .invalid);
    try t.expect(rules.resolve(.one_based, 2, 1) == .invalid);
    try t.expect(rules.resolve(.zero_based, 0, 0) == .invalid);
    try t.expect(rules.resolve(.optional_one_based, 0, 0) == .absent);
    try t.expect(rules.resolve(.inherited_char_shape, 0xffffffff, 0) == .absent);
    try t.expect(rules.resolve(.zero_based, 0xffffffff, 1) == .invalid);
    try t.expect(rules.resolve(.inherited_char_shape, 0, 0) == .invalid);
}
test "all known resource counts, signed counts, zero allocation and order independence" {
    const b = try fixture();
    defer t.allocator.free(b);
    const c = try resources.inspect(b, version, .{});
    try c.validateKnownCounts();
    inline for (@typeInfo(resources.Kind).@"enum".fields) |f| try t.expectEqual(1, c.count(@enumFromInt(f.value)));
    for (8..15) |i| {
        put(b, 4 + i * 4, i32, 2);
        try t.expectError(error.ResourceCountMismatch, refs.inspect(b, version, .{}));
        put(b, 4 + i * 4, i32, -1);
        try t.expectError(error.NegativeMappingCount, refs.inspect(b, version, .{}));
        put(b, 4 + i * 4, i32, 1);
    }
    const report = try refs.inspect(b, version, .{});
    try report.validateKnown();
    try t.expectEqual(13, report.checked);
    var reordered: std.ArrayList(u8) = .empty;
    defer reordered.deinit(t.allocator);
    try reordered.appendSlice(t.allocator, b[64..]);
    try reordered.appendSlice(t.allocator, b[0..64]);
    try t.expectEqualDeep(report, try refs.inspect(reordered.items, version, .{}));
    try t.expectError(error.LimitExceeded, refs.inspect(b, version, .{ .max_records = 1 }));
}
test "diagnostic source field and ID, font language bounds and recovery" {
    const b = try fixture();
    defer t.allocator.free(b);
    const p = try payload(b, 21);
    for (0..7) |i| {
        put(p, i * 2, u16, 1);
        const r = try refs.inspect(b, version, .{});
        try t.expectEqual(1, r.invalid);
        try t.expectEqual(refs.Field.font, r.first_issue.?.field);
        try t.expectEqual(i, r.first_issue.?.slot);
        try t.expectEqual(1, r.first_issue.?.id);
        try t.expectError(error.InvalidResourceReference, r.validateKnown());
        put(p, i * 2, u16, 0);
        try (try refs.inspect(b, version, .{})).validateKnown();
    }
    const border = try payload(b, 20);
    put(border, 40, u16, 65535);
    const invalid = try refs.inspect(b, version, .{});
    try t.expectEqual(refs.Field.fill_image, invalid.first_issue.?.field);
    put(border, 40, u16, 1);
    try (try refs.inspect(b, version, .{})).validateKnown();
}
test "active vs inactive references, deferred outline, valid style self reference" {
    const b = try fixture();
    defer t.allocator.free(b);
    const para = try payload(b, 25);
    put(para, 0, u32, 1 << 23);
    put(para, 30, u16, 0);
    var r = try refs.inspect(b, version, .{});
    try t.expectEqual(1, r.deferred);
    try r.validateKnown();
    put(para, 0, u32, 2 << 23);
    r = try refs.inspect(b, version, .{});
    try t.expectEqual(refs.Field.para_numbering, r.first_issue.?.field);
    put(para, 30, u16, 1);
    try (try refs.inspect(b, version, .{})).validateKnown();
    put(para, 0, u32, 3 << 23);
    put(para, 30, u16, 2);
    r = try refs.inspect(b, version, .{});
    try t.expectEqual(refs.Field.para_bullet, r.first_issue.?.field);
    put(para, 0, u32, 0);
    const bullet = try payload(b, 24);
    put(bullet, 14, i32, 1);
    r = try refs.inspect(b, version, .{});
    try t.expectEqual(refs.Field.bullet_image, r.first_issue.?.field);
    put(bullet, 14, i32, 2);
    r = try refs.inspect(b, version, .{});
    try t.expectEqual(1, r.deferred);
    try r.validateKnown();
    put(bullet, 14, i32, 0);
    const style = try payload(b, 26);
    style[4] = 1;
    style[5] = 255;
    put(style, 8, u16, 65535);
    try (try refs.inspect(b, version, .{})).validateKnown();
    style[4] = 7;
    r = try refs.inspect(b, version, .{});
    try t.expectEqual(1, r.deferred);
}
