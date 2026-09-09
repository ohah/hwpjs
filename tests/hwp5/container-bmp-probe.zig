const std = @import("std");
const core = @import("hwpjs");
const doc = @import("document-probe.zig");
pub fn read(r: *core.Reader) !doc.Selection {
    var selected = try @import("container-jpeg-probe.zig").read(r);
    const enabled = try r.readInt(u8);
    const total = try r.readInt(u32);
    const per_image = try r.readInt(u32);
    const trailing = try r.readInt(u8);
    if (enabled > 1 or trailing > 1 or (enabled == 1 and selected.images == null)) return error.InvalidMode;
    if (enabled == 1) {
        selected.images.?.bmp = .{ .colour_management = .unmanaged, .mask_scaling = .nearest_normalized, .max_rgba_bytes = per_image, .structure = .{ .allow_trailing_bytes = trailing == 1 } };
        selected.images.?.max_total_bmp_rgba_bytes = total;
    }
    selected.bmp_images_report = true;
    return selected;
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), report: @FieldType(core.hwp5.container_validation.Report, "images"), enabled: bool) !void {
    try @import("resource-probe.zig").int(a, out, u32, @intFromBool(enabled));
    const r: std.meta.Child(@TypeOf(report)) = report orelse .{};
    try doc.fields(a, out, r.bmp);
}
