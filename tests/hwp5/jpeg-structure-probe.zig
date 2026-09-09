const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const scans = try r.readInt(u32);
    const restarts = try r.readInt(u32);
    const pixels = try r.readInt(u64);
    const trailing = try r.readInt(u8);
    const maximum = try r.readInt(u32);
    const report = try core.image.jpeg_structure.inspect(bytes[r.offset..], .{
        .markers = .{ .max_bytes = limit, .max_markers = maximum },
        .frame = .{ .max_pixels = pixels },
        .max_scans = scans,
        .max_restarts = restarts,
        .allow_trailing_bytes = trailing != 0,
    });
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const values = [_]usize{
        report.markers,                          report.scans,            report.restart_markers,
        report.entropy_bytes,                    report.stuffed_bytes,    report.width,
        report.header_height,                    report.effective_height, @intFromBool(report.dnl_seen),
        report.restart_interval,                 report.trailing_bytes,   report.miscellaneous_markers,
        @intFromBool(report.semantics_deferred),
    };
    for (values) |n| try int(a, &out, u32, @intCast(n));
    return out.toOwnedSlice(a);
}
