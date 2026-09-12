const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, _: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const offset = try input.readInt(u32);
    const max_name = try input.readInt(u32);
    var reader: core.Reader = .{ .bytes = bytes[input.offset..], .offset = offset };
    const value = try core.hwp5.chart_type_declaration.readObserved16(&reader, max_name);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(value.raw_name.len));
    try int(a, &out, u16, value.version);
    try int(a, &out, u32, @intCast(reader.offset));
    try out.appendSlice(a, value.raw_name);
    return out.toOwnedSlice(a);
}
