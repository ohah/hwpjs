const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn payload(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8) !void {
    const p = try core.hwp5.body.object_common.Properties.parse(bytes);
    try int(a, out, u32, p.flags);
    try int(a, out, i32, p.offset_y);
    try int(a, out, i32, p.offset_x);
    try int(a, out, u32, p.width);
    try int(a, out, u32, p.height);
    try int(a, out, i32, p.z_order);
    for (p.margins) |m| try int(a, out, i16, m);
    try int(a, out, u32, p.instance_id);
    try int(a, out, i32, p.prevent_page_break);
    if (p.description_utf16) |s| {
        try int(a, out, u16, @intCast(s.len / 2));
        try out.appendSlice(a, s);
    }
    try out.appendSlice(a, p.extra);
}
