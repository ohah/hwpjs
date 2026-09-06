const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    const p = try core.hwp5.ole.Properties.parse(bytes[r.offset..], @enumFromInt(mode));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (mode == 0) try int(a, &out, u16, @intCast(p.attributes)) else try int(a, &out, u32, p.attributes);
    try int(a, &out, i32, p.extent_x);
    try int(a, &out, i32, p.extent_y);
    try int(a, &out, u16, p.bin_data_id);
    try int(a, &out, u32, p.border_color);
    try int(a, &out, i32, p.border_thickness);
    try int(a, &out, u32, p.border_attributes);
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
