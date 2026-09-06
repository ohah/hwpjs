const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const p = try core.hwp5.shape_connector.Connector.parse(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]i32{ p.start.x, p.start.y, p.end.x, p.end.y }) |v| try int(a, &out, i32, v);
    for ([_]u32{ p.kind_raw, p.start_subject_id, p.start_subject_index, p.end_subject_id, p.end_subject_index, @intCast(p.points.count()) }) |v| try int(a, &out, u32, v);
    for (0..p.points.count()) |i| {
        const point = p.points.get(i).?;
        try int(a, &out, i32, point.position.x);
        try int(a, &out, i32, point.position.y);
        try int(a, &out, u16, point.kind_raw);
    }
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
