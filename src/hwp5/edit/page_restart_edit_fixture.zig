//! Own deterministic decoded-section unit input, not a published HWP file.
const std = @import("std");
fn record(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u10, level: u10, bytes: []const u8) !void {
    var header: [4]u8 = undefined;
    std.mem.writeInt(u32, &header, @as(u32, tag) | (@as(u32, level) << 10) | (@as(u32, @intCast(bytes.len)) << 20), .little);
    try out.appendSlice(a, &header);
    try out.appendSlice(a, bytes);
}
pub fn make(a: std.mem.Allocator, number: u16, attributes: u32, tail: []const u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var header: [22]u8 = @splat(0);
    // Korean scalar + surrogate pair, eight-unit extended control, final CR.
    std.mem.writeInt(u32, header[0..4], 12, .little);
    std.mem.writeInt(u32, header[4..8], 1 << 21, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    try record(a, &out, 66, 0, &header);
    var text: [24]u8 = @splat(0);
    std.mem.writeInt(u16, text[0..2], 0xc55e, .little);
    std.mem.writeInt(u16, text[2..4], 0xd83d, .little);
    std.mem.writeInt(u16, text[4..6], 0xde00, .little);
    std.mem.writeInt(u16, text[6..8], 21, .little);
    std.mem.writeInt(u32, text[8..12], @import("../body/control_rules.zig").id("nwno"), .little);
    std.mem.writeInt(u16, text[20..22], 21, .little);
    std.mem.writeInt(u16, text[22..24], 13, .little);
    try record(a, &out, 67, 1, &text);
    try record(a, &out, 68, 1, &@as([8]u8, @splat(0)));
    const control = try a.alloc(u8, 10 + tail.len);
    defer a.free(control);
    std.mem.writeInt(u32, control[0..4], @import("../body/control_rules.zig").id("nwno"), .little);
    std.mem.writeInt(u32, control[4..8], attributes, .little);
    std.mem.writeInt(u16, control[8..10], number, .little);
    @memcpy(control[10..], tail);
    try record(a, &out, 71, 1, control);
    return out.toOwnedSlice(a);
}
