//! One request-local section evaluation; no editor cache or retained borrowed text.
const std = @import("std");
const editor = @import("editor_session.zig");
const projection = @import("formula_result_projection.zig");
const targets = @import("formula_result_targets.zig");
pub const Row = struct { paragraph: u32, text: []u8, targets: []targets.Target };

pub fn free(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |row| {
        a.free(row.text);
        a.free(row.targets);
    }
    a.free(rows);
}

pub fn read(session: *const editor.Session, section: usize) ![]Row {
    const a = session.allocator;
    var view = (try projection.prepareSection(session, section)) orelse return a.alloc(Row, 0);
    defer view.deinit();
    const paragraphs = try @import("formula_result_paragraphs.zig").listPrepared(session, section, &view.current);
    defer a.free(paragraphs);
    var rows: std.ArrayList(Row) = .empty;
    errdefer {
        for (rows.items) |row| {
            a.free(row.text);
            a.free(row.targets);
        }
        rows.deinit(a);
    }
    for (paragraphs) |paragraph| {
        if (!try projection.selectParagraph(session, section, paragraph, &view)) continue;
        const selected = try targets.listPrepared(&view);
        errdefer a.free(selected);
        if (selected.len == 0) {
            a.free(selected);
            continue;
        }
        const text = try projection.readPreparedText(&view, session.options.max_text_bytes);
        errdefer a.free(text);
        try rows.append(a, .{ .paragraph = paragraph, .text = text, .targets = selected });
    }
    return rows.toOwnedSlice(a);
}

fn expectLegacy(session: *const editor.Session) !void {
    const a = session.allocator;
    const rows = try read(session, 0);
    defer free(a, rows);
    const candidates = try @import("formula_result_paragraphs.zig").list(session, 0);
    defer a.free(candidates);
    var expected_count: usize = 0;
    for (candidates) |paragraph| {
        const old_targets = try targets.list(session, 0, paragraph);
        defer a.free(old_targets);
        if (old_targets.len == 0) continue;
        expected_count += 1;
        const matches = for (rows) |row| {
            if (row.paragraph == paragraph) break row;
        } else return error.TestExpectedEqual;
        const old_text = try projection.readText(session, 0, paragraph);
        defer a.free(old_text);
        try std.testing.expectEqualDeep(old_targets, matches.targets);
        try std.testing.expectEqualStrings(old_text, matches.text);
    }
    try std.testing.expectEqual(expected_count, rows.len);
}

test "formula display batch matches old current targets and text before and after manual edits" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const input = try fixture.zipWithSection(a, fixture.section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try expectLegacy(&session);
    const original = try read(&session, 0);
    defer free(a, original);
    try std.testing.expectEqual(@as(usize, 1), original.len);
    try std.testing.expect(try session.spliceManualFormulaResult(0, original[0].targets[0].begin_element, 0, 0, "앞😀"));
    try expectLegacy(&session);
    const changed = try read(&session, 0);
    defer free(a, changed);
    try std.testing.expectEqualStrings("앞😀2", changed[0].text);
    try std.testing.expectEqual(@as(u32, 4), changed[0].targets[0].end);
    try std.testing.expectEqualStrings("2", original[0].text);
    try std.testing.expectEqualSlices(u8, input, session.source);
    try std.testing.expectError(error.InvalidSectionIndex, read(&session, 999));
}

test "formula display batch failures preserve live overrides source and saved bytes" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const input = try fixture.zipWithSection(a, fixture.section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const first = try read(&session, 0);
    defer free(a, first);
    const begin = first[0].targets[0].begin_element;
    try std.testing.expect(try session.spliceManualFormulaResult(0, begin, 0, 0, "앞😀"));
    const saved = try session.save();
    defer a.free(saved);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session, owner: u32) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            defer std.testing.expectEqualStrings("앞😀2", original.sections[0].formula_result_overrides.get(owner).?) catch @panic("query changed result");
            const rows = try read(&proxy, 0);
            defer free(allocator, rows);
            try std.testing.expectEqual(@as(usize, 1), rows.len);
            try std.testing.expectEqualStrings("앞😀2", rows[0].text);
        }
    }.run, .{ &session, begin });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "formula display batch follows current paragraph numbering without changing source ownership" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const input = try fixture.zipWithSection(a, fixture.section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const before = try read(&session, 0);
    defer free(a, before);
    // Simulate numbering shifted by preceding sections, not a source XML edit.
    session.sections[0].first_paragraph += 7;
    session.sections[0].last_paragraph += 7;
    const after = try read(&session, 0);
    defer free(a, after);
    try std.testing.expectEqual(@as(usize, 1), after.len);
    try std.testing.expectEqual(before[0].paragraph + 7, after[0].paragraph);
    try std.testing.expectEqualStrings(before[0].text, after[0].text);
    try std.testing.expectEqualDeep(before[0].targets, after[0].targets);
    try expectLegacy(&session);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "formula display batch real chart preserves every legacy result" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try expectLegacy(&session);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
