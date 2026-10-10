//! Current source identity lookup; generated templates are not new source owners.
const std = @import("std");
pub fn build(a: std.mem.Allocator, paragraphs: []const @import("../../model/document.zig").Paragraph) !std.AutoHashMapUnmanaged(u32, usize) {
    var owners: std.AutoHashMapUnmanaged(u32, usize) = .empty;
    errdefer owners.deinit(a);
    for (paragraphs, 0..) |paragraph, index| {
        const source = paragraph.source_node orelse continue;
        if (paragraph.header_template != null) return error.SourceBindingMismatch;
        const entry = try owners.getOrPut(a, source);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
    }
    return owners;
}

test "HWP5 current source owner map ignores continuations and rejects ambiguous identities" {
    const a = std.testing.allocator;
    const original: @import("../../model/document.zig").Paragraph = .{ .source_node = 9, .parent_node = null, .declared_units = 0, .text_present = false, .para_shape_id = 0, .style_id = 0, .tokens = &.{}, .character_runs = &.{}, .deferred_direct_records = 0 };
    var generated = original;
    generated.source_node = null;
    generated.header_template = 9;
    var owners = try build(a, &.{ original, generated });
    defer owners.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), owners.count());
    try std.testing.expectEqual(@as(?usize, 0), owners.get(9));
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &.{ original, original }));
    generated.source_node = 9;
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &.{generated}));
}
