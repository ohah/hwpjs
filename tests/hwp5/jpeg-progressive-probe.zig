const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    var r: core.Reader = .{ .bytes = bytes };
    const maximum = try r.readInt(u32);
    const code = try r.readInt(u8);
    const size = try r.readInt(u16);
    const frame = try core.image.jpeg_frame.parse(code, try r.take(size), .{});
    var state = try core.image.jpeg_progressive.State.init(frame, .{ .max_scans = maximum });
    while (r.offset < bytes.len) {
        const kind = try r.readInt(u8);
        const length = try r.readInt(u16);
        const payload = try r.take(length);
        switch (kind) {
            0 => try state.installQuantization(payload, .{}),
            1 => try state.installHuffman(payload, .{}),
            2 => _ = try state.accept(payload),
            else => return error.InvalidMode,
        }
    }
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const report = state.report();
    var altered: u32 = 0;
    for (state.altered_since_scan, 0..) |changed, i| {
        if (changed) altered |= @as(u32, 1) << @as(u5, @intCast(i));
    }
    for ([_]usize{ report.scans, report.unseen_coefficients, report.partial_coefficients, report.full_coefficients, frame.components.count(), altered }) |n| try int(a, &out, u32, @intCast(n));
    for (state.history.levels[0..frame.components.count()]) |component| try out.appendSlice(a, &component);
    return out.toOwnedSlice(a);
}
