const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const wire = @import("jpeg-sample-image-wire.zig");

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const maximum = try r.readInt(u32);
    const frame_options = try @import("jpeg-progressive-frame-probe.zig").readOptions(&r, limit);
    var result = try core.image.jpeg_progressive_samples.decode(a, bytes[r.offset..], .{ .frame = frame_options, .max_samples = @min(maximum, limit / 2) });
    defer result.deinit(a);
    if (wire.required(result.image) + 16 + result.image.planes.len * 64 > limit) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try wire.append(a, &out, result.image);
    const history = result.progression;
    for ([_]usize{ history.scans, history.unseen_coefficients, history.partial_coefficients, history.full_coefficients }) |v| try int(a, &out, u32, @intCast(v));
    for (result.levels[0..result.image.planes.len]) |*levels| try out.appendSlice(a, levels);
    return out.toOwnedSlice(a);
}
