const std = @import("std");
const core = @import("hwpjs");
const doc = @import("document-probe.zig");
pub fn read(r: *core.Reader) !doc.Selection {
    var selected = try @import("container-bmp-probe.zig").read(r);
    const rle = try @import("bmp-rle-options.zig").read(r);
    if (rle != null) {
        if (selected.images == null or selected.images.?.bmp == null) return error.InvalidMode;
        selected.images.?.bmp.?.rle = rle;
    }
    selected.bmp_rle_report = true;
    return selected;
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), report: @FieldType(core.hwp5.container_validation.Report, "images"), enabled: bool) !void {
    const int = @import("resource-probe.zig").int;
    try int(a, out, u32, @intFromBool(enabled));
    const r: std.meta.Child(@TypeOf(report)) = report orelse .{};
    const bmp = r.bmp;
    for ([_]usize{ bmp.rle_images, bmp.rle_written_pixels, bmp.rle_unwritten_pixels, bmp.rle_commands, bmp.rle_consumed_bytes, bmp.rle_trailing_bytes, bmp.rle_palette_zero_pixels, bmp.rle_transparent_pixels }) |value| try int(a, out, u32, @intCast(value));
}
