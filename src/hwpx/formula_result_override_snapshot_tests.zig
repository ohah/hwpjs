//! Consistent effective display from owned manual results; no UI command.
const std = @import("std");
const editor = @import("editor_session.zig");

test "HWPX manual formula result actual text formula and style snapshots agree without editing state" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var original = try @import("formula_current_snapshot.zig").read(a, &session, 0);
    defer original.deinit(a);
    try std.testing.expectEqual(@as(usize, 13), original.rows.len);
    const node = original.rows[0].begin_element;
    try std.testing.expect(try session.sections[0].formula_result_overrides.set(a, &session.sections[0].tree, node, "수동😀<&"));
    const saved = try session.save();
    defer a.free(saved);
    var current = try @import("formula_current_snapshot.zig").read(a, &session, 0);
    defer current.deinit(a);
    try std.testing.expectEqualStrings("수동😀<&", current.rows[0].values.last_result.?);
    try std.testing.expectEqualStrings("=SUM(B?:E?)??%g,;;수동😀<&", current.rows[0].values.command.?);
    for (original.rows[1..], current.rows[1..]) |before, after| try std.testing.expectEqualStrings(before.values.last_result.?, after.values.last_result.?);
    const text_rows = try @import("paragraph_text_snapshot.zig").read(a, &session, 0);
    defer @import("paragraph_text_snapshot.zig").free(a, text_rows);
    try std.testing.expectEqualStrings("수동😀<&", text_rows[23].text);
    const styles = try @import("character_style_snapshot.zig").read(&session, 0, 24);
    defer a.free(styles);
    try std.testing.expect(styles.len > 0);
    try std.testing.expectEqual(@as(usize, 6), styles[styles.len - 1].end_unit);
    var source = try @import("formula_source_query.zig").read(a, &session.sections[0].tree, node);
    defer source.deinit();
    try std.testing.expectEqualStrings("67.5", source.values.last_result.?);
    const after_queries = try session.save();
    defer a.free(after_queries);
    try std.testing.expectEqualSlices(u8, saved, after_queries);
    try std.testing.expectEqualSlices(u8, input, session.source);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    var reopened_current = try @import("formula_current_snapshot.zig").read(a, &reopened, 0);
    defer reopened_current.deinit(a);
    try std.testing.expectEqualStrings("수동😀<&", reopened_current.rows[0].values.last_result.?);
    const reopened_styles = try @import("character_style_snapshot.zig").read(&reopened, 0, 24);
    defer a.free(reopened_styles);
    try std.testing.expect(reopened_styles.len > 0);
    try std.testing.expectEqual(@as(usize, 6), reopened_styles[reopened_styles.len - 1].end_unit);
}

test "HWPX manual formula result current snapshot OOM retains live override" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const begin = for (section.tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    try std.testing.expect(try section.formula_result_overrides.set(a, &section.tree, begin, "수동😀"));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, node: usize) !void {
            defer std.testing.expectEqualStrings("수동😀", source.sections[0].formula_result_overrides.get(node).?) catch @panic("override mutated");
            var snapshot = try @import("formula_current_snapshot.zig").read(allocator, source, 0);
            defer snapshot.deinit(allocator);
            try std.testing.expectEqualStrings("수동😀", snapshot.rows[0].values.last_result.?);
        }
    }.run, .{ &session, begin });
}

test "HWPX manual formula result automatic disposition overrides unchanged persisted source display" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const marker = std.mem.lastIndexOf(u8, fixture, "<p:t>2</p:t>").?;
    const xml = try std.mem.concat(a, u8, &.{ fixture[0..marker], "<p:t>수동</p:t>", fixture[marker + "<p:t>2</p:t>".len ..] });
    defer a.free(xml);
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const begin = for (section.tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    try std.testing.expect(try section.formula_result_overrides.recalculate(a, &section.tree, begin));
    var current = try @import("formula_current_snapshot.zig").read(a, &session, 0);
    defer current.deinit(a);
    try std.testing.expectEqualStrings("2", current.rows[0].values.last_result.?);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualStrings("2", reopened.sections[0].sites.items[1].text);
    try std.testing.expectEqualStrings("수동", section.sites.items[1].text);
}
