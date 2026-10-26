const std = @import("std");
const editor = @import("editor_session.zig");

fn input(a: std.mem.Allocator) ![]u8 {
    return @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p>");
}

test "HWPX structural manual result keeps original identity through save history and reopened topology" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const original = try @import("formula_result_targets.zig").list(&session, 0, 3);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 1), original.len);
    const begin = original[0].begin_element;
    var history = try @import("editor_history.zig").History.init(&session, 16, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "" }));
    const split = try session.save();
    defer a.free(split);
    const target = (try @import("formula_result_targets.zig").select(&session, 0, 4, 0, 0)).?;
    try std.testing.expectEqual(begin, target.begin_element);
    try std.testing.expect(try history.apply(&session, .{ .kind = .formula_result_splice, .paragraph = 4, .begin_element = begin, .start = 0, .deleted = 0, .inserted = "앞😀<&" }));
    const text = try @import("formula_result_projection.zig").readText(&session, 0, 4);
    defer a.free(text);
    try std.testing.expectEqualStrings("앞😀<&2", text);
    const changed = (try @import("formula_result_targets.zig").select(&session, 0, 4, 0, 6)).?;
    try std.testing.expectEqual(begin, changed.begin_element);
    try std.testing.expectEqual(@as(u32, 6), changed.end);
    const rows = try @import("formula_result_display_snapshot.zig").read(&session, 0);
    defer @import("formula_result_display_snapshot.zig").free(a, rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(u32, 4), rows[0].paragraph);
    try std.testing.expectEqual(begin, rows[0].targets[0].begin_element);
    try std.testing.expectEqualStrings(text, rows[0].text);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectError(error.SplitSurrogatePair, session.spliceManualFormulaResult(0, begin, 2, 0, "x"));
    const rejected = try session.save();
    defer a.free(rejected);
    try std.testing.expectEqualSlices(u8, saved, rejected);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, split, undone);
    try std.testing.expect(try history.undo(&session));
    const source = try session.save();
    defer a.free(source);
    try std.testing.expectEqualSlices(u8, bytes, source);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const reopened_text = try @import("formula_result_projection.zig").readText(&reopened, 0, 4);
    defer a.free(reopened_text);
    try std.testing.expectEqualStrings(text, reopened_text);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

fn allocationCase(a: std.mem.Allocator, bytes: []const u8) !void {
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const original = try @import("formula_result_targets.zig").list(&session, 0, 3);
    defer a.free(original);
    const begin = original[0].begin_element;
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const target = (try @import("formula_result_targets.zig").select(&session, 0, 4, 0, 0)).?;
    try std.testing.expectEqual(begin, target.begin_element);
    _ = session.spliceManualFormulaResult(0, begin, 0, 0, "앞😀") catch |err| {
        try std.testing.expect(session.sections[0].formula_result_overrides.get(begin) == null);
        try std.testing.expectEqualSlices(u8, bytes, session.source);
        return err;
    };
    try std.testing.expectEqualStrings("앞😀2", session.sections[0].formula_result_overrides.get(begin).?);
}

test "HWPX structural manual result survives edit before split and merge without identity drift" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const target = (try @import("formula_result_targets.zig").select(&session, 0, 3, 0, 0)).?;
    try std.testing.expect(try session.spliceManualFormulaResult(0, target.begin_element, 0, 0, "앞😀"));
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const moved = (try @import("formula_result_targets.zig").select(&session, 0, 4, 0, 4)).?;
    try std.testing.expectEqual(target.begin_element, moved.begin_element);
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const merged = (try @import("formula_result_targets.zig").select(&session, 0, 3, 0, 4)).?;
    try std.testing.expectEqual(target.begin_element, merged.begin_element);
    const before_rejection = try session.save();
    defer a.free(before_rejection);
    try std.testing.expectError(error.InvalidFormulaFieldNode, session.spliceManualFormulaResult(0, 0xffffffff, 0, 0, "x"));
    const after_rejection = try session.save();
    defer a.free(after_rejection);
    try std.testing.expectEqualSlices(u8, before_rejection, after_rejection);
    var reopened = try editor.open(a, after_rejection, .{});
    defer reopened.deinit();
    const text = try @import("formula_result_projection.zig").readText(&reopened, 0, 3);
    defer a.free(text);
    try std.testing.expectEqualStrings("앞😀2", text);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "HWPX structural manual result releases every temporary topology under allocation failure" {
    const bytes = try input(std.testing.allocator);
    defer std.testing.allocator.free(bytes);
    try allocationCase(std.testing.allocator, bytes);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{bytes});
}

fn existingOverrideAllocationCase(a: std.mem.Allocator, bytes: []const u8) !void {
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const target = (try @import("formula_result_targets.zig").select(&session, 0, 3, 0, 0)).?;
    try std.testing.expect(try session.spliceManualFormulaResult(0, target.begin_element, 0, 0, "기존😀"));
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    _ = session.spliceManualFormulaResult(0, target.begin_element, 0, 0, "추가<&") catch |err| {
        try std.testing.expectEqualStrings("기존😀2", session.sections[0].formula_result_overrides.get(target.begin_element).?);
        try std.testing.expectEqual(@as(usize, 4), session.sections[0].structure_values.?.paragraphs.len);
        try std.testing.expectEqualSlices(u8, bytes, session.source);
        return err;
    };
    try std.testing.expectEqualStrings("추가<&기존😀2", session.sections[0].formula_result_overrides.get(target.begin_element).?);
}

test "HWPX structural manual result replacement OOM preserves previously owned result and topology" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    try existingOverrideAllocationCase(a, bytes);
    try @import("../testing/allocation_failures.zig").check(existingOverrideAllocationCase, .{bytes});
}
