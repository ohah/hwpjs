const std = @import("std");
const core = @import("hwpjs");
const doc = @import("document-probe.zig");
const int = @import("resource-probe.zig").int;
const Options = std.meta.Child(@FieldType(core.hwp5.container_validation.Options, "preview_image"));
const Report = std.meta.Child(@FieldType(core.hwp5.container_validation.Report, "preview_image"));
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const base = try @import("container-bmp-profile-probe.zig").read(&r);
    const enabled = try r.readInt(u8);
    const empty = try r.readInt(u8);
    const unhandled = try r.readInt(u8);
    const gif_enabled = try r.readInt(u8);
    const trailing = try r.readInt(u8);
    const stream_bytes = try r.readInt(u32);
    const blocks = try r.readInt(u32);
    const sub_blocks = try r.readInt(u32);
    const frames = try r.readInt(u32);
    const pixels = try r.readInt(u32);
    const codes = try r.readInt(u32);
    const total_frames = try r.readInt(u32);
    const total_pixels = try r.readInt(u32);
    const total_codes = try r.readInt(u32);
    if (enabled > 1 or empty > 1 or unhandled > 1 or gif_enabled > 1 or trailing > 1 or base.images == null) return error.InvalidMode;
    var images = base.images.?;
    images.gif = if (gif_enabled == 1) .{ .structure = .{ .allow_trailing_bytes = trailing == 1, .max_bytes = stream_bytes, .max_blocks = blocks, .max_sub_blocks = sub_blocks }, .max_frames = frames, .max_total_pixels = pixels, .max_total_codes = codes } else null;
    images.max_total_gif_frames = total_frames;
    images.max_total_gif_index_bytes = total_pixels;
    images.max_total_gif_codes = total_codes;
    return @import("container-probe.zig").inspect(a, bytes[r.offset..], limit, false, .{ .preview_image_report = true, .preview_image = if (enabled == 1) .{ .images = images, .empty = @enumFromInt(empty), .unhandled = @enumFromInt(unhandled), .max_bytes = stream_bytes } else null });
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), report: ?Report, selection: ?Options) !void {
    const r = report orelse Report{};
    for ([_]usize{ @intFromBool(report != null), @intFromEnum(r.state), r.stored_bytes }) |n| try int(a, out, u32, @intCast(n));
    const images = if (report != null) r.images else null;
    try @import("container-images-probe.zig").serialize(a, out, images);
    try @import("container-jpeg-probe.zig").serialize(a, out, images, selection != null and selection.?.images.jpeg != null);
    try @import("container-bmp-probe.zig").serialize(a, out, images, selection != null and selection.?.images.bmp != null);
    try @import("container-bmp-rle-probe.zig").serialize(a, out, images, selection != null and selection.?.images.bmp != null and selection.?.images.bmp.?.rle != null);
    try @import("container-bmp-profile-probe.zig").serialize(a, out, images, selection != null and selection.?.images.bmp_profile != null);
    try doc.fields(a, out, r.images.gif);
}
