const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
fn string(a: std.mem.Allocator, out: *std.ArrayList(u8), raw: []const u8) !void {
    try int(a, out, u16, @intCast(raw.len / 2));
    try out.appendSlice(a, raw);
}
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    const p = try core.hwp5.equation.Properties.parse(bytes[r.offset..], @enumFromInt(mode));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, p.attributes);
    try string(a, &out, p.script);
    try int(a, &out, u32, p.font_size);
    try int(a, &out, u32, p.color);
    try int(a, &out, i16, p.baseline);
    try int(a, &out, u16, p.unknown);
    try string(a, &out, p.version_info);
    if (p.font_name) |font| try string(a, &out, font);
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
