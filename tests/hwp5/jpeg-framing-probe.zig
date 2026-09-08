const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    const size = try r.readInt(u32);
    var it = try core.image.jpeg_markers.Iterator.init(bytes[r.offset..], .{ .max_bytes = limit, .max_payload_bytes = size });
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (mode == 0) {
        const m = (try it.next()) orelse return error.UnexpectedEnd;
        for ([_]usize{ it.reader.offset, m.code, @intFromBool(m.kind == .standalone), m.fill_bytes, m.payload.len }) |n| try int(a, &out, u32, @intCast(n));
        try out.appendSlice(a, m.payload);
    } else {
        const e = try core.image.jpeg_entropy.takeUntilMarker(&it.reader, size);
        for ([_]usize{ it.reader.offset, e.stuffed_bytes, e.coded_bytes }) |n| try int(a, &out, u32, @intCast(n));
        try out.appendSlice(a, e.raw);
    }
    return out.toOwnedSlice(a);
}
