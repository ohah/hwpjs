//! Private test ABI: selection then version/section, decoded document, or CFB.
const std = @import("std");
const core = @import("hwpjs");
const d = @import("document-probe.zig");
const int = @import("resource-probe.zig").int;
fn read(r: *core.Reader) !?core.hwp5.video_data.WebLayout {
    return switch (try r.readInt(u8)) {
        0 => null,
        1 => .specified_remainder,
        2 => .{ .explicit_units = try r.readInt(u32) },
        else => error.InvalidMode,
    };
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, mode: u32) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const layout = try read(&r);
    if (mode == 301) return d.configured(a, bytes[r.offset..], limit, .{ .video_layout = layout, .video_report = true });
    if (mode == 302) return @import("container-probe.zig").inspect(a, bytes[r.offset..], limit, false, .{ .video_layout = layout, .video_report = true });
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.video_validation.inspect(tree, layout);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try d.fields(a, &out, report);
    return out.toOwnedSlice(a);
}
pub fn serialize(a: std.mem.Allocator, report: core.hwp5.document_validation.Report) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(report.sections.len));
    for (report.sections) |s| try d.fields(a, &out, s.videos);
    return out.toOwnedSlice(a);
}
