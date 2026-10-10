//! Read transient serialized topology while keeping original command identities.
const std = @import("std");
const editor = @import("editor_session.zig");
const current = @import("formula_current_snapshot.zig");

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize) !current.Snapshot {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const bytes = try session.save();
    defer session.allocator.free(bytes);
    var rendered = try editor.open(a, bytes, session.options);
    defer rendered.deinit();
    var snapshot = try current.readFlat(a, &rendered, section);
    errdefer snapshot.deinit(a);
    for (snapshot.rows) |*row| {
        const original = try @import("formula_definition_rebind.zig").findNode(a, &rendered.sections[section].tree, &session.sections[section].tree, row.begin_element);
        row.begin_element = original;
        row.owner = try @import("formula_cell_owner.zig").read(a, &session.sections[section].tree, original);
    }
    std.mem.sort(current.Row, snapshot.rows, {}, struct {
        fn less(_: void, left: current.Row, right: current.Row) bool {
            return left.begin_element < right.begin_element;
        }
    }.less);
    return snapshot;
}

test "HWPX structural formula snapshot allocation failure preserves source identity and edits" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p>");
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var node: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) node = index;
    }
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    try std.testing.expect(try session.setFormulaDefinition(0, node, "=AVG(A1:A1)"));
    const before = try session.save();
    defer a.free(before);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, live: *const editor.Session, begin: usize) !void {
            defer {
                std.testing.expectEqualStrings("=AVG(A1:A1)", live.sections[0].formula_definitions.get(begin).?) catch @panic("definition mutation");
                std.testing.expectEqual(@as(usize, 4), live.sections[0].structure_values.?.paragraphs.len) catch @panic("topology mutation");
            }
            var snapshot = try read(allocator, live, 0);
            defer snapshot.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), snapshot.rows.len);
            try std.testing.expectEqual(begin, snapshot.rows[0].begin_element);
            try std.testing.expectEqualStrings("=AVG(A1:A1)", snapshot.rows[0].values.formula.?);
            try std.testing.expectEqualStrings("2", snapshot.rows[0].values.last_result.?);
        }
    }.run, .{ &session, node });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
