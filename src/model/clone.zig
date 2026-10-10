//! Temporary owned drafts for atomic edits; no retained source/save cache.
const std = @import("std");
const model = @import("document.zig");

pub fn paragraph(a: std.mem.Allocator, source: model.Paragraph) !model.Paragraph {
    var out = source;
    out.tokens = try a.alloc(model.Token, source.tokens.len);
    var initialized: usize = 0;
    errdefer {
        for (out.tokens[0..initialized]) |t| a.free(t.raw);
        a.free(out.tokens);
    }
    for (source.tokens, 0..) |t, i| {
        out.tokens[i] = t;
        out.tokens[i].raw = try a.dupe(u8, t.raw);
        initialized += 1;
    }
    out.character_runs = try a.dupe(model.CharacterRun, source.character_runs);
    errdefer a.free(out.character_runs);
    out.range_tags = if (source.range_tags) |v| try a.dupe(model.TextRange, v) else null;
    errdefer if (out.range_tags) |v| a.free(v);
    out.field_attributes = if (source.field_attributes) |v| try a.dupe(model.FieldAttributes, v) else null;
    errdefer if (out.field_attributes) |v| a.free(v);
    out.formula_results = if (source.formula_results) |v| try a.dupe(model.FormulaResult, v) else null;
    return out;
}

pub fn section(a: std.mem.Allocator, source: model.Section) !model.Section {
    const paragraphs = try a.alloc(model.Paragraph, source.paragraphs.len);
    var initialized: usize = 0;
    errdefer {
        for (paragraphs[0..initialized]) |*p| p.deinit(a);
        a.free(paragraphs);
    }
    for (source.paragraphs, 0..) |p, i| {
        paragraphs[i] = try paragraph(a, p);
        initialized += 1;
    }
    const sizes = if (source.table_cell_sizes) |values| try a.dupe(model.TableCellSize, values) else null;
    errdefer if (sizes) |values| a.free(values);
    const pictures = if (source.picture_current_sizes) |values| try a.dupe(model.PictureCurrentSize, values) else null;
    return .{ .paragraphs = paragraphs, .source_record_count = source.source_record_count, .table_cell_sizes = sizes, .picture_current_sizes = pictures };
}

fn verifyAllocationFailures(a: std.mem.Allocator) !void {
    var raw = [_]u8{ 65, 0, 13, 0 };
    var tokens = [_]model.Token{.{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = &raw }};
    var runs = [_]model.CharacterRun{.{ .start_unit = 0, .char_shape_id = 7 }};
    var fields = [_]model.FieldAttributes{.{ .source_node = 9, .attributes = 0x2800 }};
    var results = [_]model.FormulaResult{.{ .source_node = 10, .value = 67.5, .grouping = .none, .modified = true }};
    var empty: [0]model.TextRange = .{};
    var sizes = [_]model.TableCellSize{.{ .source_list_node = 4, .width = 1234, .height = 5678 }};
    var pictures = [_]model.PictureCurrentSize{.{ .source_picture_node = 5, .width = 10000, .height = 6000 }};
    var paragraphs = [_]model.Paragraph{
        .{ .source_node = 2, .parent_node = 1, .declared_units = 2, .text_present = true, .para_shape_id = 3, .style_id = 4, .tokens = &tokens, .character_runs = &runs, .range_tags = &empty, .field_attributes = &fields, .formula_results = &results, .deferred_direct_records = 5 },
        .{ .source_node = 3, .parent_node = null, .declared_units = 2, .text_present = true, .para_shape_id = 3, .style_id = 4, .tokens = &tokens, .character_runs = &runs, .deferred_direct_records = 0 },
    };
    var draft = section(a, .{ .paragraphs = &paragraphs, .source_record_count = 12, .table_cell_sizes = &sizes, .picture_current_sizes = &pictures }) catch |err| {
        try std.testing.expectEqual(@as(u8, 65), raw[0]);
        try std.testing.expectEqual(@as(u32, 0x2800), fields[0].attributes);
        return err;
    };
    defer draft.deinit(a);
    try std.testing.expectEqual(@as(usize, 12), draft.source_record_count);
    try std.testing.expectEqualDeep(sizes[0], draft.table_cell_sizes.?[0]);
    try std.testing.expectEqualDeep(pictures[0], draft.picture_current_sizes.?[0]);
    draft.picture_current_sizes.?[0].width = 999;
    try std.testing.expectEqual(@as(u32, 10000), pictures[0].width);
    draft.table_cell_sizes.?[0].width = 999;
    try std.testing.expectEqual(@as(u32, 1234), sizes[0].width);
    try std.testing.expect(draft.paragraphs[0].range_tags != null);
    try std.testing.expect(draft.paragraphs[1].range_tags == null);
    try std.testing.expect(draft.paragraphs[1].field_attributes == null);
    draft.paragraphs[0].tokens[0].raw[0] = 66;
    draft.paragraphs[0].character_runs[0].char_shape_id = 8;
    draft.paragraphs[0].field_attributes.?[0].attributes |= 0x8000;
    draft.paragraphs[0].formula_results.?[0].value = 68.5;
    try std.testing.expect(draft.paragraphs[0].formula_results.?[0].modified);
    draft.paragraphs[0].formula_results.?[0].modified = false;
    try std.testing.expect(results[0].modified);
    try std.testing.expectEqual(@as(f64, 67.5), results[0].value);
    try std.testing.expect(draft.paragraphs[1].formula_results == null);
    try std.testing.expectEqual(@as(u8, 65), raw[0]);
    try std.testing.expectEqual(@as(u8, 65), draft.paragraphs[1].tokens[0].raw[0]);
    try std.testing.expectEqual(@as(u32, 7), runs[0].char_shape_id);
    try std.testing.expectEqual(@as(u32, 0x2800), fields[0].attributes);
}

test "model draft clone owns nested buffers and preserves optional state on every allocation failure" {
    try @import("../testing/allocation_failures.zig").check(verifyAllocationFailures, .{});
}
