//! Private test ABI: policy u8, form selection, document byte cap u32, CFB bytes.
const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const d = @import("document-probe.zig");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const policy = try r.readInt(u8);
    if (policy > 1) return error.InvalidMode;
    const forms = try @import("form-selection.zig").read(&r);
    return @import("container-probe.zig").inspect(a, bytes[r.offset..], limit, false, .{ .view_text_semantics = @enumFromInt(policy), .view_text_semantic_report = true, .forms = forms });
}
pub fn serialize(a: std.mem.Allocator, report: core.hwp5.container_validation.Report) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const v = report.view_text;
    for ([_]usize{ @intFromBool(v.declared), @intFromBool(v.present), v.sections, v.records, v.decoded_bytes, v.deferred_records, report.total_decoded_bytes, report.uninspected_streams, @intFromBool(report.view_text_semantics != null) }) |n| try int(a, &out, u32, @intCast(n));
    if (report.view_text_semantics) |s| {
        try int(a, &out, u32, @intCast(s.sections.len));
        try int(a, &out, u32, @intCast(s.records));
        try d.fields(a, &out, s.memo_references);
        try d.fields(a, &out, s.memo_end_references);
        try d.fields(a, &out, s.memo_ranges);
        try d.serializeSections(a, &out, s.sections);
    }
    return out.toOwnedSlice(a);
}
