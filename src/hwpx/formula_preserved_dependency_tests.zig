//! Display-only preservation is not numeric evaluation of a manual result.
const std = @import("std");
const editor = @import("editor_session.zig");

fn chain(a: std.mem.Allocator) ![]u8 {
    const fixture = @import("test_formula_fixture.zig").section;
    const first = std.mem.indexOf(u8, fixture, "<p:tc>").?;
    const second = std.mem.indexOfPos(u8, fixture, first + 1, "<p:tc>").?;
    const end = std.mem.indexOfPos(u8, fixture, second, "</p:tc>").? + "</p:tc>".len;
    var extra = try a.dupe(u8, fixture[second..end]);
    defer a.free(extra);
    for ([_][2][]const u8{
        .{ "colAddr='1'", "colAddr='2'" },
        .{ "id='1'", "id='2'" },
        .{ "beginIDRef='1'", "beginIDRef='2'" },
        .{ "=SUM(A1:A1)", "=SUM(B1:B1)" },
    }) |pair| {
        const next = try std.mem.replaceOwned(u8, a, extra, pair[0], pair[1]);
        a.free(extra);
        extra = next;
    }
    const expanded = try std.mem.concat(a, u8, &.{ fixture[0..end], extra, fixture[end..] });
    defer a.free(expanded);
    const xml = try std.mem.replaceOwned(u8, a, expanded, "colCnt='2'", "colCnt='3'");
    defer a.free(xml);
    return @import("test_formula_fixture.zig").zipWithSection(a, xml);
}

fn begins(session: *const editor.Session) ![2]usize {
    var values: [2]usize = undefined;
    var count: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        if (count >= values.len) return error.TestUnexpectedResult;
        values[count] = index;
        count += 1;
    }
    try std.testing.expectEqual(values.len, count);
    return values;
}

fn preserved(a: std.mem.Allocator) !void {
    const input = try chain(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const fields = try begins(&session);
    _ = session.setManualFormulaResult(0, fields[0], "수동😀<&") catch |err| {
        try std.testing.expect(session.sections[0].formula_result_overrides.get(fields[0]) == null);
        return err;
    };
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualStrings("수동😀<&", reopened.sections[0].sites.items[1].text);
    try std.testing.expectEqualStrings("2", reopened.sections[0].sites.items[2].text);
    var source = try @import("formula_source_snapshot.zig").read(a, &reopened.sections[0].tree);
    defer source.deinit(a);
    try std.testing.expectEqualStrings("2", source.rows[0].values.last_result.?);
    try std.testing.expectEqualStrings("2", source.rows[1].values.last_result.?);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "HWPX preserved dependency display-only save and every allocation failure" {
    try @import("../testing/checked_allocator.zig").run(preserved, .{});
    try @import("../testing/allocation_failures.zig").check(preserved, .{});
}

test "HWPX preserved dependency actual definition evaluation still refuses manual input atomically" {
    const a = std.testing.allocator;
    const input = try chain(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const fields = try begins(&session);
    try std.testing.expect(try session.setManualFormulaResult(0, fields[0], "manual"));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectError(error.UnsupportedFormulaResultDependency, session.setFormulaDefinition(0, fields[1], "=AVG(B1:B1)"));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
    try std.testing.expect(session.sections[0].formula_definitions.get(fields[1]) == null);
    // A real numeric input change resets the manual origin and evaluates the chain.
    try std.testing.expect(try session.splice(0, 1, 0, 1, "5"));
    var current = try @import("formula_current_snapshot.zig").read(a, &session, 0);
    defer current.deinit(a);
    try std.testing.expectEqualStrings("5", current.rows[0].values.last_result.?);
    try std.testing.expectEqualStrings("5", current.rows[1].values.last_result.?);
}
