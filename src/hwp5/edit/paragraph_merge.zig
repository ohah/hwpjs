//! Owned plain paragraph merge draft; logical scope and deleted records belong to caller.
const std = @import("std");
const model = @import("../../model/document.zig");
const content = @import("plain_text_content.zig");
const runs = @import("character_runs.zig");

/// Caller must validate adjacency and logical LIST_HEADER/cell identity separately.
/// Equal parent_node alone is not sufficient for sibling table cells.
pub fn prepare(a: std.mem.Allocator, left: model.Paragraph, right: model.Paragraph, char_count: usize, max_bytes: usize) !model.Paragraph {
    if (left.parent_node != right.parent_node) return error.ParagraphOwnerMismatch;
    for ([_]model.Paragraph{ left, right }) |p| {
        if (p.field_attributes != null or p.formula_results != null) return error.UnsupportedStructuralControl;
        if (p.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    }
    const first = try content.editableTextBytes(a, left);
    defer a.free(first);
    const second = try content.editableTextBytes(a, right);
    defer a.free(second);
    try content.validatePlain(first);
    try content.validatePlain(second);
    try runs.validate(left.character_runs, first, char_count);
    try runs.validate(right.character_runs, second, char_count);
    const length = std.math.add(usize, first.len - 2, second.len) catch return error.LimitExceeded;
    if (length > max_bytes or length / 2 > 0x7fffffff) return error.LimitExceeded;
    const text = try a.alloc(u8, length);
    defer a.free(text);
    @memcpy(text[0 .. first.len - 2], first[0 .. first.len - 2]);
    @memcpy(text[first.len - 2 ..], second);
    const owned_runs = try runs.join(a, left.character_runs, right.character_runs, @intCast(first.len / 2 - 1));
    errdefer a.free(owned_runs);
    const tokens = try a.alloc(model.Token, if (length > 2) 2 else 1);
    errdefer a.free(tokens);
    var initialized: usize = 0;
    errdefer for (tokens[0..initialized]) |t| a.free(t.raw);
    if (length > 2) {
        tokens[0] = .{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = try a.dupe(u8, text[0 .. length - 2]) };
        initialized = 1;
    }
    tokens[initialized] = .{ .start_unit = @intCast(length / 2 - 1), .kind = .control, .encoding = .utf16le, .raw = try a.dupe(u8, &.{ 13, 0 }) };
    initialized += 1;
    const owned_ranges = try a.alloc(model.TextRange, 0);
    errdefer a.free(owned_ranges);
    var result = try @import("../../model/clone.zig").paragraph(a, left);
    for (result.tokens) |t| a.free(t.raw);
    a.free(result.tokens);
    a.free(result.character_runs);
    if (result.range_tags) |ranges| a.free(ranges);
    result.tokens = tokens;
    result.character_runs = owned_runs;
    result.range_tags = owned_ranges;
    result.text_present = true;
    result.declared_units = @intCast(length / 2);
    return result;
}

test "paragraph merge draft restores split text preserves runs and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const original = document.sections[0].paragraphs[1];
    const expected = try content.editableTextBytes(a, original);
    defer a.free(expected);
    for ([_]u32{ 0, 1, @intCast(expected.len / 2 - 1) }) |at| {
        var split = try @import("paragraph_split.zig").prepare(a, raw, source.header.version(), original, at, 0xfffffffe, 1000);
        defer split.deinit(a);
        var joined = try prepare(a, split.left, split.right, 1000, 4_000_000);
        defer joined.deinit(a);
        const bytes = try content.editableTextBytes(a, joined);
        defer a.free(bytes);
        try std.testing.expectEqualSlices(u8, expected, bytes);
        try std.testing.expectEqual(original.source_node, joined.source_node);
        try std.testing.expectEqual(original.instance_id, joined.instance_id);
        try runs.validate(joined.character_runs, bytes, 1000);
        for (0..expected.len / 2 + 1) |unit| {
            var wanted = original.character_runs[0].char_shape_id;
            for (original.character_runs) |row| {
                if (row.start_unit > unit) break;
                wanted = row.char_shape_id;
            }
            var actual = joined.character_runs[0].char_shape_id;
            for (joined.character_runs) |row| {
                if (row.start_unit > unit) break;
                actual = row.char_shape_id;
            }
            try std.testing.expectEqual(wanted, actual);
        }
        var forged = split.right;
        forged.parent_node = if (split.left.parent_node == null) 0 else null;
        try std.testing.expectError(error.ParagraphOwnerMismatch, prepare(a, split.left, forged, 1000, 4_000_000));
        forged = split.right;
        var fields = [_]model.FieldAttributes{.{ .source_node = 0, .attributes = 0 }};
        forged.field_attributes = &fields;
        try std.testing.expectError(error.UnsupportedStructuralControl, prepare(a, split.left, forged, 1000, 4_000_000));
        forged = split.right;
        var ranges = [_]model.TextRange{.{ .start_unit = 0, .end_unit = 1, .tag = 0 }};
        forged.range_tags = &ranges;
        try std.testing.expectError(error.UnsupportedRangeSemantics, prepare(a, split.left, forged, 1000, 4_000_000));
        try std.testing.expectError(error.LimitExceeded, prepare(a, split.left, split.right, 1000, 1));
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, first: model.Paragraph, second: model.Paragraph) !void {
                var value = try prepare(allocator, first, second, 1000, 4_000_000);
                defer value.deinit(allocator);
            }
        }.run, .{ split.left, split.right });
    }
}
