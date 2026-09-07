const std = @import("std");
const core = @import("hwpjs");
fn dateNumber(bytes: []const u8) u32 {
    var n: u32 = 0;
    for (bytes) |b| if (b != '-') {
        n = n * 10 + b - '0';
    };
    return n;
}
pub fn run(a: std.mem.Allocator, input: []const u8, limit: usize) ![]u8 {
    if (input.len < 4) return error.UnexpectedEnd;
    const r = try core.text.bcp47_registry.inspect(a, input[4..], .{ .max_bytes = limit, .max_subtags = std.mem.readInt(u32, input[0..4], .little) });
    const syntax = try @import("bcp47-probe.zig").encode(a, r.syntax);
    defer a.free(syntax);
    const out = try a.alloc(u8, syntax.len + 20);
    @memcpy(out[0..syntax.len], syntax);
    const dates = core.text.bcp47_registry.data.dates;
    const extra = [_]u32{ @intCast(r.lookups), @intFromBool(r.extlang_prefix_checked), @intCast(r.extension_semantics_deferred), dateNumber(dates.subtags), dateNumber(dates.extensions) };
    for (extra, 0..) |v, i| std.mem.writeInt(u32, out[syntax.len + i * 4 ..][0..4], v, .little);
    return out;
}
