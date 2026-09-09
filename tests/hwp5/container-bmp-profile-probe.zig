const std = @import("std");
const core = @import("hwpjs");
const doc = @import("document-probe.zig");
pub fn read(r: *core.Reader) !doc.Selection {
    var selected = try @import("container-bmp-rle-probe.zig").read(r);
    const enabled = try r.readInt(u8);
    const content = try r.readInt(u8);
    const linked = try r.readInt(u8);
    const semantics = try r.readInt(u8);
    const maximum = try r.readInt(u32);
    const link_bytes = try r.readInt(u32);
    const tags = try r.readInt(u32);
    const total = try r.readInt(u32);
    if (enabled > 1 or content > 2 or linked > 1 or semantics > 1 or (semantics == 1 and content == 0)) return error.InvalidMode;
    if (enabled == 1) {
        if (selected.images == null or selected.images.?.bmp == null) return error.InvalidMode;
        selected.images.?.bmp_profile = .{ .max_profile_bytes = maximum, .max_link_bytes = link_bytes, .linked = if (linked == 1) .preserve else .reject, .content = if (content == 0) null else .{
            .max_tags = tags,
            .layout = if (content == 1) .bounded else .icc_2022,
            .required = if (semantics == 1) .{ .edition = .v4_2022, .model = .matrix, .measurement_white = .unknown } else null,
            .payloads = if (semantics == 1) .{ .edition = .v4_2022 } else null,
        } };
        selected.images.?.max_total_bmp_profile_bytes = total;
    }
    selected.bmp_profile_report = true;
    return selected;
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), report: @FieldType(core.hwp5.container_validation.Report, "images"), enabled: bool) !void {
    const int = @import("resource-probe.zig").int;
    try int(a, out, u32, @intFromBool(enabled));
    const r: std.meta.Child(@TypeOf(report)) = report orelse .{};
    try doc.fields(a, out, r.bmp_profile);
}
