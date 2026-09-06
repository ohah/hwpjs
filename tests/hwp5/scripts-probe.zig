const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const kind = try r.readInt(u8);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (kind == 0) {
        const v = try core.hwp5.script_version.Version.parse(bytes[1..]);
        try int(a, &out, u32, v.high);
        try int(a, &out, u32, v.low);
        try out.appendSlice(a, v.extra);
    } else if (kind == 1) {
        const s = try core.hwp5.script_source.Source.parse(bytes[1..]);
        for ([_][]const u8{ s.header, s.source, s.pre, s.post }) |field| {
            try int(a, &out, u32, @intCast(field.len / 2));
            try out.appendSlice(a, field);
        }
        try int(a, &out, u32, 0xffffffff);
        try out.appendSlice(a, s.extra);
    } else return error.InvalidScriptProbeKind;
    return out.toOwnedSlice(a);
}
