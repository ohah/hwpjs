const std = @import("std");
const core = @import("hwpjs");
const d = @import("document-probe.zig");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selected = try r.readInt(u8);
    if (selected > 2) return error.InvalidMode;
    var options: std.meta.Child(@FieldType(d.Selection, "ole")) = .{ .layout = .raw_cfb };
    options.max_containers = try r.readInt(u32);
    options.max_total_envelope_bytes = try r.readInt(u32);
    options.max_total_stream_bytes = try r.readInt(u32);
    options.max_total_entries = try r.readInt(u32);
    options.max_total_path_bytes = try r.readInt(u32);
    if (selected == 2) options.layout = .observed_size_prefix;
    return @import("container-probe.zig").inspect(a, bytes[r.offset..], limit, false, .{ .ole = if (selected == 0) null else options, .ole_binary_report = true });
}
pub fn serialize(a: std.mem.Allocator, report: core.hwp5.container_validation.Report) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intFromBool(report.ole != null));
    const value: std.meta.Child(@TypeOf(report.ole)) = report.ole orelse .{};
    try d.fields(a, &out, value);
    try int(a, &out, u32, @intCast(report.total_decoded_bytes));
    try int(a, &out, u32, @intCast(report.binary_data.decoded_bytes));
    return out.toOwnedSlice(a);
}
