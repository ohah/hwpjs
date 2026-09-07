const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
/// Test-only XML report wire owner shared by standalone and HWP container probes.
pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), report: core.xml.document.Report) !void {
    const fields = [_]usize{ report.bytes, report.characters, report.events, report.elements, report.end_tags, report.attributes, report.references, report.text_scalars, report.comments, report.cdata, report.processing_instructions, report.max_depth, @intFromBool(report.namespaces_validated) };
    for (fields) |v| try int(a, out, u32, @intCast(v));
}
