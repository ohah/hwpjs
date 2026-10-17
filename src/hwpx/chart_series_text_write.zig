//! Source-bound XML candidate; ZIP/OLE atomic publication belongs to Session.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const model = @import("chart_series_text_values.zig");
pub const Edit = struct { ordinal: usize, text: []const u8 };

pub fn write(a: std.mem.Allocator, tree: *const Tree, values: *const model.Values, ordinal: usize, text: []const u8, max_bytes: usize) ![]u8 {
    return writeEdits(a, tree, values, &.{.{ .ordinal = ordinal, .text = text }}, max_bytes);
}

pub fn writeEdits(a: std.mem.Allocator, tree: *const Tree, values: *const model.Values, edits: []const Edit, max_bytes: usize) ![]u8 {
    try values.validateSource(tree);
    var original = try model.collect(a, tree, .{});
    defer original.deinit(a);
    if (original.items.len != values.items.len) return error.SourceBindingMismatch;
    for (original.items, values.items) |source, current| {
        if (source.series_node != current.series_node or source.text_node != current.text_node or source.value_node != current.value_node or !std.mem.eql(u8, source.text, current.text)) return error.SourceBindingMismatch;
    }
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer changes.deinit(a);
    var encoded: std.ArrayList([]u8) = .empty;
    defer {
        for (encoded.items) |item| a.free(item);
        encoded.deinit(a);
    }
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (edits) |edit| {
        if (edit.ordinal >= values.items.len) return error.InvalidChartSeriesTextIndex;
        if ((try seen.getOrPut(a, edit.ordinal)).found_existing) return error.DuplicateChartSeriesTextEdit;
        if (edit.text.len > model.default_max_value_bytes) return error.LimitExceeded;
        if (std.mem.eql(u8, values.items[edit.ordinal].text, edit.text)) continue;
        const text = block: {
            const owned = try @import("xstring.zig").encodeContent(a, edit.text, max_bytes);
            errdefer a.free(owned);
            try encoded.append(a, owned);
            break :block owned;
        };
        try @import("xml_leaf_text_changes.zig").append(a, tree, values.items[edit.ordinal].value_node, text, &changes);
    }
    std.mem.sort(@import("xml_source_writer.zig").Change, changes.items, {}, struct {
        fn less(_: void, left: @import("xml_source_writer.zig").Change, right: @import("xml_source_writer.zig").Change) bool {
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
    for (values.items, current.items, 0..) |source, actual, index| {
        var expected: []const u8 = source.text;
        for (edits) |edit| if (edit.ordinal == index) {
            expected = edit.text;
            break;
        };
        if (source.series_node != actual.series_node or source.text_node != actual.text_node or source.value_node != actual.value_node or !std.mem.eql(u8, actual.text, expected)) return error.SourceBindingMismatch;
    }
    return output;
}
