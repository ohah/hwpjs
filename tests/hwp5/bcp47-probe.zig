const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, input: []const u8, limit: usize) ![]u8 {
    if (input.len < 4) return error.UnexpectedEnd;
    const bytes = input[4..];
    const r = try core.text.bcp47.inspect(a, bytes, .{ .max_bytes = limit, .max_subtags = std.mem.readInt(u32, input[0..4], .little) });
    var fields: [21]u32 = @splat(0);
    fields[0..7].* = .{ @intFromEnum(r.kind), @intCast(r.subtags), @intCast(r.extlang_count), @intCast(r.variant_count), @intCast(r.extension_count), @intCast(r.private_count), @intFromBool(r.registry_validated) };
    for ([_][]const u8{ r.language, r.extlangs, r.script, r.region, r.variants, r.extensions, r.private_use }, 0..) |span, i| if (span.len != 0) {
        fields[7 + i * 2] = @intCast(@intFromPtr(span.ptr) - @intFromPtr(bytes.ptr));
        fields[8 + i * 2] = @intCast(span.len);
    };
    const out = try a.alloc(u8, 84);
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
    return out;
}
