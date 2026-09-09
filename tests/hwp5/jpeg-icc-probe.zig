const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, mode: u32) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const maximum = try r.readInt(u32);
    if (mode == 271) {
        var collector = core.image.jpeg_icc_chunks.Collector.init(maximum);
        while (r.offset < bytes.len) {
            const length = try r.readInt(u32);
            try collector.add(try r.take(length));
        }
        const profile = try collector.assemble(a);
        defer if (profile) |data| a.free(data);
        return serialize(a, collector.count orelse 0, profile, null, limit);
    }
    if (mode == 272) {
        var result = try core.image.jpeg_icc_extraction.extract(a, bytes[r.offset..], .{ .max_profile_bytes = maximum, .structure = .{ .markers = .{ .max_bytes = limit } } });
        defer result.deinit(a);
        return serialize(a, result.chunk_count, result.profile_bytes, null, limit);
    }
    const layout = try r.readInt(u8);
    if (layout > 1) return error.InvalidIccLayoutPolicy;
    const max_tags = try r.readInt(u32);
    var result = try core.image.jpeg_icc_profile.inspect(a, bytes[r.offset..], .{ .extraction = .{ .max_profile_bytes = maximum, .structure = .{ .markers = .{ .max_bytes = limit } } }, .max_tags = max_tags, .layout = if (layout == 0) .bounded else .icc_2022 });
    defer if (result) |*value| value.deinit(a);
    if (result) |value| return serialize(a, value.chunk_count, value.bytes, .{ @intCast(value.tags.tags.len), @intFromEnum(value.id_status) }, limit);
    return serialize(a, 0, null, .{ 0, 0 }, limit);
}

fn serialize(a: std.mem.Allocator, count: u8, profile: ?[]const u8, detail: ?[2]u32, limit: usize) ![]u8 {
    const data = profile orelse &.{};
    if (@as(u64, data.len) + (if (detail != null) @as(u64, 16) else 8) > limit) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, count);
    try int(a, &out, u32, @intCast(data.len));
    if (detail) |values| for (values) |n| try int(a, &out, u32, n);
    try out.appendSlice(a, data);
    return out.toOwnedSlice(a);
}
