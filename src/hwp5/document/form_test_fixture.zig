const std = @import("std");
const f = @import("test_fixture.zig");
fn frame(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u32, level: u32, payload: []const u8) !void {
    var h: [4]u8 = undefined;
    f.put(&h, 0, u32, tag | (level << 10) | (@as(u32, @intCast(payload.len)) << 20));
    try out.appendSlice(a, &h);
    try out.appendSlice(a, payload);
}
pub fn section(a: std.mem.Allocator) ![]u8 {
    const base = try f.section(a);
    defer a.free(base);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, base);
    var para = [_]u8{0} ** 24;
    f.put(&para, 0, u32, 8);
    try frame(a, &out, 66, 0, &para);
    var token = [_]u8{0} ** 16;
    f.put(&token, 0, u16, 11);
    f.put(&token, 2, u32, @import("../body/control_rules.zig").form_id);
    f.put(&token, 14, u16, 11);
    try frame(a, &out, 67, 1, &token);
    var ctrl = [_]u8{0} ** 44;
    @memcpy(ctrl[0..4], token[2..6]);
    try frame(a, &out, 71, 1, &ctrl);
    const text = "CharShapeSet:set:18:CharShapeID:int:0 ";
    var object = [_]u8{0} ** (14 + text.len * 2);
    @memcpy(object[0..8], "tbp+tbp+");
    f.put(&object, 8, u32, text.len);
    f.put(&object, 12, u16, text.len);
    for (text, 0..) |c, i| object[14 + i * 2] = c;
    try frame(a, &out, 91, 2, &object);
    return out.toOwnedSlice(a);
}
