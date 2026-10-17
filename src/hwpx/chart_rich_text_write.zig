//! XML-only run replacement. Session owns atomic XML/OLE publication.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const model = @import("chart_rich_text_values.zig");
const Change = @import("xml_source_writer.zig").Change;
pub const Edit = struct { ordinal: usize, text: []const u8 };

const sameOwner = model.sameOwner;

pub fn write(a: std.mem.Allocator, tree: *const Tree, values: *const model.Values, ordinal: usize, text: []const u8, max_bytes: usize) ![]u8 {
    return writeEdits(a, tree, values, &.{.{ .ordinal = ordinal, .text = text }}, max_bytes);
}

pub fn writeEdits(a: std.mem.Allocator, tree: *const Tree, values: *const model.Values, edits: []const Edit, max_bytes: usize) ![]u8 {
    try values.validateSource(tree);
    var original = try model.collect(a, tree, .{});
    defer original.deinit(a);
    if (original.items.len != values.items.len) return error.SourceBindingMismatch;
    for (original.items, values.items) |source, current| {
        if (!sameOwner(source, current) or !std.mem.eql(u8, source.text, current.text)) return error.SourceBindingMismatch;
    }
    var changes: std.ArrayList(Change) = .empty;
    defer changes.deinit(a);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (edits) |edit| {
        if (edit.ordinal >= values.items.len) return error.InvalidChartRichTextIndex;
        if ((try seen.getOrPut(a, edit.ordinal)).found_existing) return error.DuplicateChartRichTextEdit;
        if (edit.text.len > model.default_max_value_bytes) return error.LimitExceeded;
        if (std.mem.eql(u8, values.items[edit.ordinal].text, edit.text)) continue;
        try @import("xml_leaf_text_changes.zig").append(a, tree, values.items[edit.ordinal].value_node, edit.text, &changes);
    }
    std.mem.sort(Change, changes.items, {}, struct {
        fn less(_: void, left: Change, right: Change) bool {
            return left.start < right.start;
        }
    }.less);
    const output = try @import("xml_source_writer.zig").write(a, tree.source, changes.items, max_bytes);
    errdefer a.free(output);
    var parsed = try @import("chart_tree.zig").parse(a, output, tree.item_index, .{ .max_xml_bytes = max_bytes });
    defer parsed.deinit(a);
    var current = try model.collect(a, &parsed, .{});
    defer current.deinit(a);
    if (current.items.len != values.items.len) return error.SourceBindingMismatch;
    for (values.items, current.items, 0..) |source, actual, ordinal| {
        var expected: []const u8 = source.text;
        for (edits) |edit| if (edit.ordinal == ordinal) {
            expected = edit.text;
            break;
        };
        if (!sameOwner(source, actual) or !std.mem.eql(u8, actual.text, expected)) return error.SourceBindingMismatch;
    }
    return output;
}
