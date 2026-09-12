//! Test-only policy selection; no public JS API.
const std = @import("std");
const core = @import("hwpjs");
const d = @import("document-probe.zig");
pub fn read(r: *core.Reader) !@FieldType(d.Selection, "distribution") {
    const value = try r.readInt(u8);
    if (value > 1) return error.InvalidMode;
    return @enumFromInt(value);
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const policy = try read(&r);
    return @import("container-probe.zig").inspect(a, bytes[r.offset..], limit, false, .{ .distribution = policy, .primary_source_report = true });
}
pub fn decoded(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const policy = try read(&r);
    return d.configured(a, bytes[r.offset..], limit, .{ .distribution = policy });
}
