const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version = try r.readInt(u32);
    const report = try core.hwp5.references.inspect(bytes[r.offset..], .{ .raw = version }, .{ .max_records = limit });
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    for ([_]usize{ report.checked, report.invalid, report.deferred, report.unknown_records }) |n| try int(a, &out, u32, @intCast(n));
    if (report.first_issue) |i| {
        for ([_]u32{ @intCast(i.record_offset), i.tag, @intFromEnum(i.field), i.slot, i.id }) |n| try int(a, &out, u32, n);
    } else {
        for (0..5) |_| try int(a, &out, u32, 0xffffffff);
    }
    return out.toOwnedSlice(a);
}
