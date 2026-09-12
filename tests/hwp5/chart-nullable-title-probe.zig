const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const per = try input.readInt(u32);
    const total = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    const stored = try input.readInt(u32);
    const contents = bytes[input.offset..];
    var prefix = try @import("chart-nullable-title-prefix.zig").read(a, contents, limit, per, total, max_objects, stored);
    defer prefix.deinit();
    const reader = &prefix.previous.previous.previous.reader;
    const types = &prefix.previous.previous.previous.grid.prelude.types;
    const objects = &prefix.previous.previous.objects;
    const axis = prefix.axis;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ reader.offset, types.definitions.count(), objects.entries.count(), objects.string_bytes }) |v| try int(a, &out, u32, @intCast(v));
    try @import("chart-axes-probe.zig").serialize(a, &out, axis, objects);
    return out.toOwnedSlice(a);
}
