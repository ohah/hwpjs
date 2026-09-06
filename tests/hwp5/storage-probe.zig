const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    const item = try core.hwp5.docinfo.BinData.parse(bytes[r.offset..]);
    const target = try item.target(@enumFromInt(mode));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u8, @intFromBool(target != null));
    if (target) |v| {
        try int(a, &out, u16, v.id);
        try int(a, &out, u8, @intFromBool(v.extension_utf16 != null));
        if (v.extension_utf16) |ext| try @import("resource-probe.zig").string(a, &out, ext);
        try int(a, &out, u32, @intCast(v.extra.len));
        try out.appendSlice(a, v.extra);
    }
    return out.toOwnedSlice(a);
}
