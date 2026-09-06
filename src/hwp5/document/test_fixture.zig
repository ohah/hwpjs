//! Synthetic in-memory fixture shared only by document tests.
const std = @import("std");
pub fn put(b: []u8, at: usize, comptime T: type, n: T) void {
    std.mem.writeInt(T, b[at..][0..@sizeOf(T)], n, .little);
}
pub fn header() [256]u8 {
    var h = [_]u8{0} ** 256;
    @memcpy(h[0..17], "HWP Document File");
    put(&h, 32, u32, 0x05000107);
    return h;
}
fn frame(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u10, level: u10, b: []const u8) !void {
    var word: [4]u8 = undefined;
    put(&word, 0, u32, @as(u32, tag) | (@as(u32, level) << 10) | (@as(u32, @intCast(b.len)) << 20));
    try out.appendSlice(a, &word);
    try out.appendSlice(a, b);
}
pub fn docInfo(a: std.mem.Allocator, count: u16) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var props = [_]u8{0} ** 27;
    put(&props, 0, u16, count);
    props[26] = 0xa5; // Borrowed, uninterpreted property tail.
    try frame(a, &out, 16, 0, &props);
    var map = [_]u8{0} ** 60;
    if (count != 0) {
        for (1..8) |i| put(&map, i * 4, u32, 1);
        for ([_]usize{ 9, 10, 13, 14 }) |i| put(&map, i * 4, u32, 1);
    }
    try frame(a, &out, 17, 0, &map);
    if (count != 0) {
        for (0..7) |_| try frame(a, &out, 19, 1, &.{ 0, 0, 0 });
        try frame(a, &out, 21, 1, &([_]u8{0} ** 68));
        try frame(a, &out, 22, 1, &([_]u8{0} ** 8));
        try frame(a, &out, 25, 1, &([_]u8{0} ** 42));
        try frame(a, &out, 26, 1, &([_]u8{0} ** 12));
    }
    return out.toOwnedSlice(a);
}
pub fn section(a: std.mem.Allocator) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var para = [_]u8{0} ** 24;
    put(&para, 0, u32, 8);
    try frame(a, &out, 66, 0, &para);
    var text = [_]u8{0} ** 16;
    put(&text, 0, u16, 2);
    put(&text, 2, u32, 0x73656364);
    put(&text, 14, u16, 2);
    try frame(a, &out, 67, 1, &text);
    var control = [_]u8{0} ** 30;
    put(&control, 0, u32, 0x73656364);
    try frame(a, &out, 71, 1, &control);
    try frame(a, &out, 73, 2, &([_]u8{0} ** 40));
    return out.toOwnedSlice(a);
}
