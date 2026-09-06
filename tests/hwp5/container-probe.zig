const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const max_bytes = try r.readInt(u32);
    var report = try core.hwp5.container_validation.inspect(a, bytes[r.offset..], .{ .document = .{
        .list_layout = .observed8,
        .zone_layout = .observed_row_first,
        .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty },
        .max_total_bytes = max_bytes,
        .max_total_records = limit,
    } });
    defer report.deinit(a);
    const doc = try @import("document-probe.zig").serialize(a, report.document);
    defer a.free(doc);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, doc);
    const scripts = report.scripts;
    try int(a, &out, u32, @intFromBool(scripts.version != null));
    try int(a, &out, u32, if (scripts.version) |v| v.high else 0);
    try int(a, &out, u32, if (scripts.version) |v| v.low else 0);
    try int(a, &out, u32, @intFromBool(scripts.source_units != null));
    for (scripts.source_units orelse .{ 0, 0, 0, 0 }) |n| try int(a, &out, u32, @intCast(n));
    try int(a, &out, u32, @intCast(scripts.decoded_bytes));
    try int(a, &out, u32, @intCast(scripts.trailing_bytes));
    try int(a, &out, u32, @intFromBool(report.summary_information != null));
    const summary = report.summary_information orelse core.hwp5.summary_information.Stats{};
    inline for (std.meta.fields(@TypeOf(summary))) |f| try int(a, &out, u32, @intCast(@field(summary, f.name)));
    try int(a, &out, u32, @intFromBool(report.preview_text != null));
    const preview = report.preview_text orelse core.hwp5.preview_text.Stats{};
    inline for (std.meta.fields(@TypeOf(preview))) |f| try int(a, &out, u32, @intCast(@field(preview, f.name)));
    inline for (std.meta.fields(@TypeOf(report.binary_data))) |f| try int(a, &out, u32, @intCast(@field(report.binary_data, f.name)));
    try int(a, &out, u32, @intCast(report.total_decoded_bytes));
    try int(a, &out, u32, @intCast(report.uninspected_streams));
    return out.toOwnedSlice(a);
}
