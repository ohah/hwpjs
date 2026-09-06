const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const layout = try r.readInt(u8);
    const prefix = try r.readInt(u8);
    if (layout > 1 or prefix > 2) return error.InvalidMode;
    const p = try core.hwp5.shape_picture.Picture.parse(bytes[r.offset..], @enumFromInt(layout), @enumFromInt(prefix));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, p.border_color);
    try int(a, &out, i32, p.border_width);
    try int(a, &out, u32, p.borderAttributes().raw);
    for (0..4) |i| {
        const point = p.points.get(i).?;
        try int(a, &out, i32, point.x);
        try int(a, &out, i32, point.y);
    }
    for (p.crop) |v| try int(a, &out, i32, v);
    for (p.margins) |v| try int(a, &out, i16, v);
    try int(a, &out, i8, p.image.contrast);
    try int(a, &out, i8, p.image.brightness);
    try int(a, &out, u8, p.image.effect);
    try int(a, &out, u16, p.image.bin_data_id);
    try int(a, &out, u32, @as(u32, @intFromBool(p.border_opacity != null)) | (@as(u32, @intFromBool(p.instance_id != null)) << 1));
    try int(a, &out, u32, p.border_opacity orelse 0);
    try int(a, &out, u32, p.instance_id orelse 0);
    try int(a, &out, u32, @intCast(p.extra.len));
    try out.appendSlice(a, p.extra);
    return out.toOwnedSlice(a);
}
