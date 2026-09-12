//! Private selection ABI; never infer a storage ID from an ordinal bounds check.
const std = @import("std");
const core = @import("hwpjs");
const d = @import("document-probe.zig");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, mode: u32) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const raw = try r.readInt(u8);
    if (raw > 1) return error.InvalidMode;
    const policy: core.hwp5.ole_validation.references.Policy = @enumFromInt(raw);
    if (mode == 304) return d.configured(a, bytes[r.offset..], limit, .{ .ole_references = policy, .ole_reference_report = true });
    if (mode == 305) return @import("container-probe.zig").inspect(a, bytes[r.offset..], limit, false, .{ .ole_references = policy, .ole_reference_report = true });
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const layout = try r.readInt(u8);
    if (layout > 1) return error.InvalidMode;
    const count = try r.readInt(u32);
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.ole_validation.inspectDetailed(tree, @enumFromInt(layout), if (count == 0xffffffff) null else count, policy);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try row(a, &out, report);
    return out.toOwnedSlice(a);
}
fn row(a: std.mem.Allocator, out: *std.ArrayList(u8), report: core.hwp5.ole_validation.Detailed) !void {
    try d.fields(a, out, report.ole);
    try d.fields(a, out, report.references);
}
pub fn serialize(a: std.mem.Allocator, report: core.hwp5.document_validation.Report) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(report.sections.len));
    for (report.sections) |s| try row(a, &out, .{ .ole = s.ole, .references = s.ole_references });
    return out.toOwnedSlice(a);
}
