const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const v = try core.hwp5.form_object.View.parseObserved(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, &v.type_id);
    try out.appendSlice(a, &v.secondary_type_id);
    try int(a, &out, u32, v.raw_length);
    try int(a, &out, u32, @intCast(v.properties.len));
    try int(a, &out, u32, @intCast(v.extra.len));
    try int(a, &out, u32, @intFromEnum(v.kind()));
    try out.appendSlice(a, v.properties);
    try out.appendSlice(a, v.extra);
    return out.toOwnedSlice(a);
}
