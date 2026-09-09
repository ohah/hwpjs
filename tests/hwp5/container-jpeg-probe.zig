const std = @import("std");
const core = @import("hwpjs");
const doc = @import("document-probe.zig");
pub fn read(r: *core.Reader) !doc.Selection {
    var selected = try @import("container-images-probe.zig").read(r);
    const enabled = try r.readInt(u8);
    const method = try r.readInt(u8);
    const full = try r.readInt(u8);
    const rgb = try r.readInt(u32);
    if (enabled > 1 or (enabled == 1 and selected.images == null)) return error.InvalidMode;
    if (method > 1) return error.InvalidInterpolationMethod;
    if (full > 1) return error.InvalidJpegCompletionPolicy;
    if (enabled == 1) {
        selected.images.?.jpeg = .{ .completion = if (full == 1) .require_full else .preserve_partial, .render = .{ .upsampling = if (method == 0) .nearest else .bilinear, .colour_management = .unmanaged } };
        selected.images.?.max_total_jpeg_rgb_bytes = rgb;
    }
    selected.jpeg_images_report = true;
    return selected;
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), report: @FieldType(core.hwp5.container_validation.Report, "images"), enabled: bool) !void {
    try @import("resource-probe.zig").int(a, out, u32, @intFromBool(enabled));
    const r: std.meta.Child(@TypeOf(report)) = report orelse .{};
    try doc.fields(a, out, r.jpeg);
}
