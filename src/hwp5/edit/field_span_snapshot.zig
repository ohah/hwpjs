//! Owned current coordinates derived by the existing source binding validator.
const std = @import("std");
const spans = @import("local_field_spans.zig");
pub const Row = struct {
    source_node: u32,
    field_id: u32,
    ordinal: usize,
    begin: spans.Position,
    end: spans.Position,
};

pub fn read(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: @import("../../model/document.zig").Section) ![]Row {
    const bindings = try @import("field_bindings.zig").collectReadable(a, source, version, section);
    defer a.free(bindings);
    const rows = try a.alloc(Row, bindings.len);
    for (bindings, rows) |binding, *row| row.* = .{
        .source_node = binding.source_node,
        .field_id = binding.span.field_id,
        .ordinal = binding.span.ordinal,
        .begin = binding.span.begin,
        .end = binding.span.end,
    };
    return rows;
}

fn allocationCase(a: std.mem.Allocator, session: *const @import("style_preservation.zig").Session) !void {
    const rows = try session.fieldSpans(a, 0);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(u32, 32), rows[0].begin.unit);
    try std.testing.expectEqual(@as(u32, 39), rows[0].end.unit);
}

test "field span snapshot releases every partial allocation and never changes the source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/추진일정.hwp", a, .limited(2_000_000));
    defer a.free(input);
    const session = try @import("style_preservation.zig").Session.open(a, input);
    defer session.close();
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{session});
    try std.testing.expectError(error.InvalidSection, session.fieldSpans(a, session.sectionCount()));
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, input, saved.bytes);
}
