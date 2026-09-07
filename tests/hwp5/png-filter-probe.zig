const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const kind = try r.readInt(u8);
    const stride = try r.readInt(u8);
    const has_previous = try r.readInt(u8);
    if (has_previous > 1) return error.InvalidMode;
    const len = try r.readInt(u32);
    if (len > limit) return error.LimitExceeded;
    const previous: ?[]const u8 = if (has_previous == 1) try r.take(len) else null;
    const source = try r.take(len);
    if (r.offset != bytes.len) return error.TrailingData;
    const row = try a.dupe(u8, source);
    errdefer a.free(row);
    try core.image.png_filter.restore(kind, stride, row, previous);
    return row;
}
