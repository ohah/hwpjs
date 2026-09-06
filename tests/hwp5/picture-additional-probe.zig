const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, composed: bool) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > @as(u8, if (composed) 2 else 1)) return error.InvalidMode;
    var flags: u32 = 0;
    const p: ?core.hwp5.picture_additional.Additional = if (composed) blk: {
        const tail = try core.hwp5.picture_tail.Tail.read(&r, if (mode == 0) null else @enumFromInt(mode - 1));
        flags = tail.effects.flags;
        break :blk tail.properties;
    } else try core.hwp5.picture_additional.Additional.read(&r, @enumFromInt(mode));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, flags);
    try int(a, &out, u32, if (p) |v| v.width else 0);
    try int(a, &out, u32, if (p) |v| v.height else 0);
    try int(a, &out, u32, @intFromBool(p != null));
    try int(a, &out, u32, @intFromBool(if (p) |v| v.alpha != null else false));
    try int(a, &out, i32, if (p) |v| v.alpha orelse 0 else 0);
    try int(a, &out, u32, if (p) |v| v.alphaByte() orelse 0 else 0);
    try int(a, &out, u32, @intCast(bytes.len - r.offset));
    try out.appendSlice(a, bytes[r.offset..]);
    return out.toOwnedSlice(a);
}
