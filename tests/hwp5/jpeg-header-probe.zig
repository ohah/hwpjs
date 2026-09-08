const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    var r: core.Reader = .{ .bytes = bytes };
    const selected = try r.readInt(u8);
    if (selected > 1) return error.InvalidMode;
    const code = try r.readInt(u8);
    const pixels = try r.readInt(u64);
    const components = try r.readInt(u16);
    const length = try r.readInt(u16);
    const f = try core.image.jpeg_frame.parse(code, try r.take(length), .{ .max_pixels = pixels, .max_components = components });
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]usize{ f.width, f.height, f.precision, @intFromEnum(f.process.mode), @intFromEnum(f.process.coding), f.components.count(), @intFromBool(f.pixels() == null) }) |n| try int(a, &out, u32, @intCast(n));
    try out.appendSlice(a, f.components.raw);
    if (selected == 1) {
        const s = try core.image.jpeg_scan.parse(bytes[r.offset..], f);
        for ([_]usize{ s.components.count(), s.spectral_start, s.spectral_end, s.approximation_high, s.approximation_low }) |n| try int(a, &out, u32, @intCast(n));
        try out.appendSlice(a, s.components.raw);
    } else if (r.offset != bytes.len) return error.TrailingBytes;
    return out.toOwnedSlice(a);
}
