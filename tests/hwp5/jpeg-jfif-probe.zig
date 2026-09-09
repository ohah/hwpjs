const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, frame: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (frame) {
        var r: core.Reader = .{ .bytes = bytes };
        const code = try r.readInt(u8);
        const parsed = try core.image.jpeg_frame.parse(code, bytes[r.offset..], .{});
        try core.image.jpeg_jfif.validateFrame(parsed);
        if (limit < 16) return error.LimitExceeded;
        for ([_]u32{ parsed.width, parsed.height, parsed.precision, @intCast(parsed.components.count()) }) |n| try int(a, &out, u32, n);
    } else {
        const parsed = try core.image.jpeg_jfif.Header.parse(bytes);
        if (limit < 28 or parsed.thumbnail_rgb.len > limit - 28) return error.LimitExceeded;
        for ([_]u32{ parsed.version, @intFromEnum(parsed.units), parsed.horizontal_density, parsed.vertical_density, parsed.thumbnail_width, parsed.thumbnail_height, @intCast(parsed.thumbnail_rgb.len) }) |n| try int(a, &out, u32, n);
        try out.appendSlice(a, parsed.thumbnail_rgb);
    }
    return out.toOwnedSlice(a);
}
