const std = @import("std");
const core = @import("hwpjs");
const Selection = @import("document-probe.zig").Selection;
const int = @import("resource-probe.zig").int;
pub fn read(r: *core.Reader) !Selection {
    const selected = try r.readInt(u8);
    if (selected > 1) return error.InvalidMode;
    const pixels = try r.readInt(u32);
    const binaries = try r.readInt(u32);
    return .{ .images = if (selected == 1) .{ .max_total_pixel_bytes = pixels, .max_binaries = binaries } else null, .images_report = true };
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), report: @FieldType(core.hwp5.container_validation.Report, "images")) !void {
    try int(a, out, u32, @intFromBool(report != null));
    const r: std.meta.Child(@TypeOf(report)) = report orelse .{};
    for ([_]usize{ r.binaries, r.png_images, r.unhandled_binaries, r.pixel_bytes, r.png_extension_disagreements, r.profile_images, r.color_deferred_images, r.ancillary_chunks_deferred, r.png_zlib_trailing_bytes, @intFromBool(report != null and r.semantics_deferred) }) |value| try int(a, out, u32, @intCast(value));
}
