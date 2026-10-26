//! Current result ownership on the paragraph UTF-16 axis; no source cache offsets.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Target = @import("field_label_targets.zig").Target;
const Range = struct { start: u32, end: u32 };

pub fn list(session: *const editor.Session, section: usize, paragraph: usize) ![]Target {
    return collect(session, section, paragraph, null);
}

pub fn select(session: *const editor.Session, section: usize, paragraph: usize, start: u32, end: u32) !?Target {
    if (end < start) return error.InvalidTextPosition;
    const targets = try collect(session, section, paragraph, .{ .start = start, .end = end });
    defer session.allocator.free(targets);
    if (targets.len > 1) return error.UnsupportedFormulaResultRange;
    return if (targets.len == 1) targets[0] else null;
}

fn collect(session: *const editor.Session, section_index: usize, paragraph: usize, range: ?Range) ![]Target {
    const a = session.allocator;
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    if (session.sections[section_index].structure_values != null) {
        var current = try @import("formula_result_structural_view.zig").open(session, section_index);
        defer current.deinit();
        const rows = try collect(&current.rendered, section_index, paragraph, range);
        errdefer a.free(rows);
        for (rows) |*row| row.begin_element = std.math.cast(u32, try current.originalNode(row.begin_element)) orelse return error.LimitExceeded;
        return rows;
    }
    var view = (try @import("formula_result_projection.zig").prepare(session, section_index, paragraph)) orelse return a.alloc(Target, 0);
    defer view.deinit();
    return collectPrepared(&view, range);
}

pub fn listPrepared(view: *const @import("formula_result_projection.zig").View) ![]Target {
    return collectPrepared(view, null);
}

fn collectPrepared(view: *const @import("formula_result_projection.zig").View, range: ?Range) ![]Target {
    const a = view.allocator;
    const sites = view.sites();
    const segments = view.segments;
    var targets: std.ArrayList(Target) = .empty;
    errdefer targets.deinit(a);
    for (view.current.prepared) |field| {
        var first: ?usize = null;
        var last: usize = 0;
        for (segments) |segment| {
            if (segment.kind != .text) continue;
            const owned = for (field.result.items) |replacement| {
                if (replacement.site_index == segment.index) break true;
            } else false;
            if (!owned) continue;
            if (first == null) first = segment.start_unit;
            last = segment.end_unit;
        }
        const start = first orelse continue;
        if (range) |selected| {
            if (selected.start < start or selected.end > last) continue;
            try @import("paragraph_text_positions.zig").validateBoundary(&sites, segments, selected.start);
            try @import("paragraph_text_positions.zig").validateBoundary(&sites, segments, selected.end);
        }
        try targets.append(a, .{
            .begin_element = std.math.cast(u32, field.begin) orelse return error.LimitExceeded,
            .start = std.math.cast(u32, start) orelse return error.LimitExceeded,
            .end = std.math.cast(u32, last) orelse return error.LimitExceeded,
        });
    }
    return targets.toOwnedSlice(a);
}

fn actualChart(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const original = try list(&session, 0, 24);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 1), original.len);
    try std.testing.expectEqual(@as(u32, 4), original[0].end);
    try std.testing.expect(try session.spliceManualFormulaResult(0, original[0].begin_element, 0, 0, "앞😀"));
    const saved = try session.save();
    defer a.free(saved);
    const changed = try list(&session, 0, 24);
    defer a.free(changed);
    try std.testing.expectEqual(@as(u32, 7), changed[0].end);
    const text = try @import("formula_result_projection.zig").readText(&session, 0, 24);
    defer a.free(text);
    try std.testing.expectEqualStrings("앞😀67.5", text);
    try std.testing.expectEqual(changed[0], (try select(&session, 0, 24, 0, 7)).?);
    try std.testing.expectError(error.SplitSurrogatePair, select(&session, 0, 24, 2, 2));
    try std.testing.expect(try select(&session, 0, 24, 0, 8) == null);
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "HWPX formula result targets actual edited display uses current UTF16 ownership" {
    try @import("../testing/checked_allocator.zig").run(actualChart, .{});
}

test "HWPX formula result target queries retain live state at every allocation failure" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const fields = try list(&session, 0, 2);
    defer a.free(fields);
    try std.testing.expectEqual(@as(usize, 1), fields.len);
    try std.testing.expect(try session.spliceManualFormulaResult(0, fields[0].begin_element, 0, 0, "앞😀"));
    const saved = try session.save();
    defer a.free(saved);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session, begin: u32) !void {
            var view = original.*;
            view.allocator = allocator;
            defer std.testing.expectEqualStrings("앞😀2", original.sections[0].formula_result_overrides.get(begin).?) catch @panic("query mutated override");
            const target = (try select(&view, 0, 2, 0, 4)) orelse return error.TestExpectedEqual;
            try std.testing.expectEqual(begin, target.begin_element);
            try std.testing.expectEqual(@as(u32, 4), target.end);
            const text = try @import("formula_result_projection.zig").readText(&view, 0, 2);
            defer allocator.free(text);
            try std.testing.expectEqualStrings("앞😀2", text);
        }
    }.run, .{ &session, fields[0].begin_element });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
