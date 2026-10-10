const std = @import("std");
const model = @import("document.zig");
const values = @import("formula_result_values.zig");

fn ownership(a: std.mem.Allocator) !void {
    var expression = [_]u8{ 'S', 0 };
    var source = [_]model.FormulaResult{
        .{ .source_node = 3, .value = 1, .grouping = .none, .expression = &expression },
        .{ .source_node = 5, .value = 2, .grouping = .none, .expression = &expression },
    };
    var rows = try values.clone(a, &source);
    defer values.deinit(a, rows);
    const other = rows[1].expression.?.ptr;
    rows = try values.upsert(a, rows, .{ .source_node = 3, .value = 7, .grouping = .none, .expression = rows[0].expression });
    try std.testing.expectEqual(@as(f64, 7), rows[0].value);
    try std.testing.expectEqual(@intFromPtr(other), @intFromPtr(rows[1].expression.?.ptr));
    expression[0] = 'X';
    try std.testing.expectEqual(@as(u8, 'S'), rows[0].expression.?[0]);
    try std.testing.expectEqual(@as(u8, 'S'), rows[1].expression.?[0]);
    try std.testing.expectEqual(@as(f64, 1), source[0].value);
    var next = rows[0];
    next.expression = null;
    rows = try values.upsert(a, rows, next);
    try std.testing.expect(rows[0].expression == null);
    rows = try values.upsert(a, rows, .{ .source_node = 8, .value = 9, .grouping = .none, .expression = &expression });
    try std.testing.expectEqual(@as(usize, 3), rows.len);
}

test "formula result ownership clones definitions and atomically replaces borrowed aliases through every allocation failure" {
    try @import("../testing/allocation_failures.zig").check(ownership, .{});
}

test "formula result ownership rejects ambiguous original source identity" {
    var rows = [_]model.FormulaResult{
        .{ .source_node = 3, .value = 1, .grouping = .none },
        .{ .source_node = 3, .value = 2, .grouping = .none },
    };
    try std.testing.expectError(error.SourceBindingMismatch, values.find(&rows, 3));
    try std.testing.expectError(error.SourceBindingMismatch, values.upsert(std.testing.allocator, &rows, rows[0]));
    try std.testing.expect((try values.find(&rows, 4)) == null);
}

fn checkpointOwnership(a: std.mem.Allocator) !void {
    var expression = [_]u8{ 'S', 0 };
    var results = [_]model.FormulaResult{.{ .source_node = 3, .value = 1, .grouping = .none, .expression = &expression }};
    var paragraphs = [_]model.Paragraph{.{ .source_node = 1, .parent_node = null, .declared_units = 0, .text_present = false, .para_shape_id = 0, .style_id = 0, .tokens = &.{}, .character_runs = &.{}, .formula_results = &results, .deferred_direct_records = 0 }};
    const sections = try a.alloc(model.Section, 1);
    sections[0] = @import("clone.zig").section(a, .{ .paragraphs = &paragraphs, .source_record_count = 8 }) catch |err| {
        a.free(sections);
        return err;
    };
    var document: model.Document = .{ .format = .hwp5, .sections = sections };
    defer document.deinit(a);
    const checkpoints = @import("../hwp5/edit/editor_checkpoint.zig");
    const required = try checkpoints.size(&document, 100000);
    var bare_results = [_]model.FormulaResult{results[0]};
    bare_results[0].expression = null;
    var bare_paragraphs = paragraphs;
    bare_paragraphs[0].formula_results = &bare_results;
    var bare_sections = [_]model.Section{.{ .paragraphs = &bare_paragraphs, .source_record_count = 8 }};
    const bare: model.Document = .{ .format = .hwp5, .sections = &bare_sections };
    try std.testing.expectEqual(expression.len, required - try checkpoints.size(&bare, 100000));
    var owner: u8 = 0;
    try std.testing.expectError(error.LimitExceeded, checkpoints.capture(a, &owner, &document, required - 1));
    const saved = try checkpoints.capture(a, &owner, &document, required);
    defer saved.deinit();
    try std.testing.expect(try checkpoints.matches(saved, a, &owner, &document));
    document.sections[0].paragraphs[0].formula_results.?[0].expression.?[0] = 'X';
    document.sections[0].paragraphs[0].formula_results.?[0].value = 7;
    try std.testing.expect(!try checkpoints.matches(saved, a, &owner, &document));
    try checkpoints.exchange(saved, a, &owner, &document);
    try std.testing.expectEqual(@as(u8, 'S'), document.sections[0].paragraphs[0].formula_results.?[0].expression.?[0]);
    try std.testing.expectEqual(@as(f64, 1), document.sections[0].paragraphs[0].formula_results.?[0].value);
    try checkpoints.exchange(saved, a, &owner, &document);
    try std.testing.expectEqual(@as(u8, 'X'), document.sections[0].paragraphs[0].formula_results.?[0].expression.?[0]);
    try std.testing.expectEqual(@as(f64, 7), document.sections[0].paragraphs[0].formula_results.?[0].value);
    try std.testing.expectEqual(@as(u8, 'S'), expression[0]);
}

test "formula result ownership checkpoint includes definitions in clone equality budget and exact undo redo under all failures" {
    try @import("../testing/allocation_failures.zig").check(checkpointOwnership, .{});
}
