const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    const layout: core.hwp5.video_data.WebLayout = switch (mode) {
        0 => .specified_remainder,
        1 => .{ .explicit_units = try r.readInt(u32) },
        else => return error.InvalidMode,
    };
    const p = try core.hwp5.video_data.Video.parse(bytes[r.offset..], layout);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    switch (p.data) {
        .local => |v| {
            try int(a, &out, u32, 0);
            try int(a, &out, u16, v.video_id);
            try int(a, &out, u16, v.thumbnail_id);
        },
        .web => |v| {
            try int(a, &out, u32, 1);
            try int(a, &out, u32, @intCast(v.tag_utf16.len / 2));
            try out.appendSlice(a, v.tag_utf16);
            try int(a, &out, u16, v.thumbnail_id);
        },
    }
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
