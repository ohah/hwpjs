const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, mode: u32) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const maximum = try r.readInt(u32);
    const link = try r.readInt(u32);
    const tags = try r.readInt(u32);
    const layout = try r.readInt(u8);
    const trailing = try r.readInt(u8);
    if (layout > 1 or trailing > 1) return error.InvalidMode;
    const options: core.image.bmp_profile_transport.Options = .{ .max_profile_bytes = maximum, .max_link_bytes = link, .structure = .{ .allow_trailing_bytes = trailing == 1 } };
    if (mode == 292) return serialize(a, try core.image.bmp_profile_transport.inspect(bytes[r.offset..], options), null, limit);
    var result = try core.image.bmp_profile_inspection.inspect(a, bytes[r.offset..], .{ .transport = options, .max_tags = tags, .layout = if (layout == 0) .bounded else .icc_2022 });
    defer if (result) |*value| value.deinit(a);
    if (result) |value| return serialize(a, value.transport, .{ @intCast(value.table.tags.len), @intFromEnum(value.id_status) }, limit);
    return serialize(a, null, .{ 0, 0 }, limit);
}
fn serialize(a: std.mem.Allocator, view: ?core.image.bmp_profile_transport.View, detail: ?[2]u32, limit: usize) ![]u8 {
    const data: []const u8 = if (view) |v| v.data else &.{};
    const size: usize = if (detail != null) 40 else 32;
    if (limit < size or data.len > limit - size) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const values: [8]u32 = if (view) |v| .{ if (v.kind == .embedded) 1 else 2, @intCast(v.file_offset), v.declared_size, @intCast(v.data.len), @intCast(v.stored_bytes), @intCast(v.before_profile.len), @intCast(v.after_profile.len), @intFromBool(v.semantics_deferred) } else [_]u32{0} ** 8;
    for (values) |n| try int(a, &out, u32, n);
    if (detail) |values2| for (values2) |n| try int(a, &out, u32, n);
    try out.appendSlice(a, data);
    return out.toOwnedSlice(a);
}
