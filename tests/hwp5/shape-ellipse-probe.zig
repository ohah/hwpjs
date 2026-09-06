const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const p = try core.hwp5.shape_ellipse.Ellipse.parse(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, p.attributes);
    inline for (.{ "center", "axis1", "axis2", "start1", "end1", "start2", "end2" }) |f| {
        try int(a, &out, i32, @field(p, f).x);
        try int(a, &out, i32, @field(p, f).y);
    }
    try int(a, &out, u32, @intFromBool(p.needsIntervalUpdate()));
    try int(a, &out, u32, @intFromBool(p.isArc()));
    try int(a, &out, u32, p.arcKindRaw());
    try int(a, &out, u32, p.unknownBits());
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
