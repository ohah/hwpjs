//! Apply current DrawingML runs after cache/series edits, with no XML cache.
const std = @import("std");
const model = @import("chart_rich_text_values.zig");
const writer = @import("chart_rich_text_write.zig");

pub fn apply(a: std.mem.Allocator, source: *const @import("chart_tree.zig").Tree, values: *const model.Values, candidate: []const u8, limit: usize) !?[]u8 {
    try values.validateSource(source);
    var original = try model.collect(a, source, .{});
    defer original.deinit(a);
    if (original.items.len != values.items.len) return error.SourceBindingMismatch;
    var edits: std.ArrayList(writer.Edit) = .empty;
    defer edits.deinit(a);
    for (original.items, values.items, 0..) |before, after, ordinal| {
        if (!model.sameOwner(before, after)) return error.SourceBindingMismatch;
        if (!std.mem.eql(u8, before.text, after.text)) try edits.append(a, .{ .ordinal = ordinal, .text = after.text });
    }
    if (edits.items.len == 0) return null;
    var tree = try @import("chart_tree.zig").parse(a, candidate, source.item_index, .{ .max_xml_bytes = limit });
    defer tree.deinit(a);
    var unchanged = try model.collect(a, &tree, .{});
    defer unchanged.deinit(a);
    if (original.items.len != unchanged.items.len) return error.SourceBindingMismatch;
    for (original.items, unchanged.items) |before, after| {
        if (!model.sameOwner(before, after) or !std.mem.eql(u8, before.text, after.text)) return error.SourceBindingMismatch;
    }
    return try writer.writeEdits(a, &tree, &unchanged, edits.items, limit);
}
