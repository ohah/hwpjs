const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
fn fixed(a: std.mem.Allocator, out: *std.ArrayList(u8), value: anytype) !void {
    inline for (std.meta.fields(@TypeOf(value))) |f| try int(a, out, f.type, @field(value, f.name));
}
fn color(a: std.mem.Allocator, out: *std.ArrayList(u8), p: core.hwp5.picture_color.Color) !void {
    try int(a, out, i32, p.type_raw);
    try int(a, out, u32, p.value_raw);
    try int(a, out, u32, @intCast(p.effects.count()));
    for (0..p.effects.count()) |i| try fixed(a, out, p.effects.get(i).?);
}
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const p = try core.hwp5.picture_effects.Effects.read(&r);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, p.flags);
    if (p.shadow) |v| {
        try fixed(a, &out, v.properties);
        try color(a, &out, v.color);
    }
    if (p.neon) |v| {
        try fixed(a, &out, v.properties);
        try color(a, &out, v.color);
    }
    if (p.soft_edge_radius_bits) |v| try int(a, &out, u32, v);
    if (p.reflection) |v| try fixed(a, &out, v);
    try int(a, &out, u32, @intCast(bytes.len - r.offset));
    try out.appendSlice(a, bytes[r.offset..]);
    return out.toOwnedSlice(a);
}
