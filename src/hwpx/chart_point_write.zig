//! Immutable XML candidate only. Does not publish either ZIP/OLE representation.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const Values = @import("chart_point_values.zig").Values;
pub const Edit = struct { point: usize, value: []const u8 };
pub const max_value_bytes = 1024 * 1024;

fn numeric(value: []const u8) bool {
    if (value.len == 0 or value.len > max_value_bytes) return false;
    for (value) |byte| if (std.mem.indexOfScalar(u8, "+-0123456789.eE", byte) == null) return false;
    const number = std.fmt.parseFloat(f64, value) catch return false;
    return std.math.isFinite(number);
}
pub fn validateNumeric(value: []const u8) !void {
    if (!numeric(value)) return error.InvalidChartNumericValue;
}
pub fn validateValue(kind: @import("chart_cache_kind.zig").Kind, value: []const u8) !void {
    if (kind == .numeric_cache or kind == .numeric_literal) return validateNumeric(value);
    if (value.len > max_value_bytes) return error.LimitExceeded;
    if (!std.unicode.utf8ValidateSlice(value)) return error.InvalidUtf8;
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, values: *const Values, edits: []const Edit, max_bytes: usize) ![]u8 {
    return writeMode(a, tree, values, edits, max_bytes, false);
}
pub fn writeNumeric(a: std.mem.Allocator, tree: *const Tree, values: *const Values, edits: []const Edit, max_bytes: usize) ![]u8 {
    return writeMode(a, tree, values, edits, max_bytes, true);
}
fn writeMode(a: std.mem.Allocator, tree: *const Tree, values: *const Values, edits: []const Edit, max_bytes: usize, numeric_only: bool) ![]u8 {
    try values.validateSource(tree);
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer changes.deinit(a);
    var encoded_values: std.ArrayList([]u8) = .empty;
    defer {
        for (encoded_values.items) |value| a.free(value);
        encoded_values.deinit(a);
    }
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (edits) |edit| {
        if (edit.point >= values.points.len) return error.InvalidChartPointIndex;
        if ((try seen.getOrPut(a, edit.point)).found_existing) return error.DuplicateChartPointEdit;
        const point = values.points[edit.point];
        const numeric_point = point.kind == .numeric_cache or point.kind == .numeric_literal;
        if (numeric_only and !numeric_point) return error.UnsupportedChartPointKind;
        try validateValue(point.kind, edit.value);
        if (std.mem.eql(u8, point.value, edit.value)) continue;
        const replacement = if (numeric_point) edit.value else block: {
            const encoded = try @import("xstring.zig").encodeContent(a, edit.value, max_bytes);
            errdefer a.free(encoded);
            try encoded_values.append(a, encoded);
            break :block encoded;
        };
        try @import("xml_leaf_text_changes.zig").append(a, tree, point.value_node, replacement, &changes);
    }
    std.mem.sort(@import("xml_source_writer.zig").Change, changes.items, {}, struct {
        fn less(_: void, lhs: @import("xml_source_writer.zig").Change, rhs: @import("xml_source_writer.zig").Change) bool {
            return lhs.start < rhs.start;
        }
    }.less);
    const output = try @import("xml_source_writer.zig").write(a, tree.source, changes.items, max_bytes);
    errdefer a.free(output);
    var parsed = try @import("chart_tree.zig").parse(a, output, tree.item_index, .{ .max_xml_bytes = max_bytes });
    defer parsed.deinit(a);
    var current = try @import("chart_point_values.zig").collect(a, &parsed, .{});
    defer current.deinit(a);
    if (current.points.len != values.points.len) return error.SourceBindingMismatch;
    for (values.points, current.points, 0..) |original, point, ordinal| {
        var expected: []const u8 = original.value;
        for (edits) |edit| if (edit.point == ordinal) {
            expected = edit.value;
            break;
        };
        if (point.index != original.index or point.kind != original.kind or point.cache_node != original.cache_node or point.level_node != original.level_node or !std.mem.eql(u8, point.value, expected)) return error.SourceBindingMismatch;
    }
    return output;
}
