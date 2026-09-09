const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (limit < 44) return error.LimitExceeded;
    const report = try core.image.jpeg_jfif_layout.inspect(bytes, .{ .markers = .{ .max_bytes = limit } });
    const h = report.header;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]usize{ report.extensions, report.unknown_extensions, report.compressed_thumbnails_unchecked, report.application_markers, h.version, @intFromEnum(h.units), h.horizontal_density, h.vertical_density, h.thumbnail_width, h.thumbnail_height, report.structure.markers }) |n| try int(a, &out, u32, @intCast(n));
    return out.toOwnedSlice(a);
}
