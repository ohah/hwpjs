const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
fn matrix(a: std.mem.Allocator, out: *std.ArrayList(u8), m: anytype) !void {
    for (m.bits) |bits| try int(a, out, u64, bits);
}
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    const p = try core.hwp5.shape_component.Component.parse(bytes[r.offset..], @enumFromInt(mode));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, p.id);
    if (p.second_id) |second| try int(a, &out, u32, second);
    inline for (.{ "offset_x", "offset_y", "group_count", "local_version", "original_width", "original_height", "current_width", "current_height", "attributes", "rotation_angle", "rotation_x", "rotation_y" }) |f| {
        const value = @field(p, f);
        try int(a, &out, @TypeOf(value), value);
    }
    try int(a, &out, u16, @intCast(p.rendering.pairs.count()));
    try matrix(a, &out, p.rendering.translation);
    for (0..p.rendering.pairs.count()) |i| {
        const pair = p.rendering.pairs.get(i).?;
        try matrix(a, &out, pair.scale);
        try matrix(a, &out, pair.rotation);
    }
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
