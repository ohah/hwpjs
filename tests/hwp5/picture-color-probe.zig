const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const p = try core.hwp5.picture_color.Color.read(&r);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, i32, p.type_raw);
    try int(a, &out, u32, p.value_raw);
    try int(a, &out, u32, @intCast(p.effects.count()));
    var known: u32 = 0;
    for (0..p.effects.count()) |i| {
        const e = p.effects.get(i).?;
        try int(a, &out, i32, e.kind_raw);
        try int(a, &out, u32, e.value_bits);
        known += @intFromBool(e.kind() != null);
    }
    try int(a, &out, u32, known);
    try int(a, &out, u32, @intCast(bytes.len - r.offset));
    try out.appendSlice(a, bytes[r.offset..]);
    return out.toOwnedSlice(a);
}
