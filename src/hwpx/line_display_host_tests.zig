const std = @import("std");
const host = @import("line_display_host.zig");
const editor = @import("editor_session.zig");

fn probe(a: std.mem.Allocator, session: *const editor.Session, node: usize, ordinal: usize, unit: usize) !void {
    const section = &session.sections[0];
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    try std.testing.expectEqual(ordinal, try host.currentOrdinal(&section.tree, view.paragraphs, section.first_paragraph, node));
    try std.testing.expectEqual(unit, try host.anchorUnit(a, &section.tree, &view.paragraphs[ordinal - section.first_paragraph], node));
}

test "HWPX line display host follows actual split input merge history and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var nodes: [2]usize = undefined;
    var count: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "line")) continue;
        if (count >= nodes.len) return error.UnexpectedLineCount;
        nodes[count] = index;
        count += 1;
    }
    try std.testing.expectEqual(nodes.len, count);
    try probe(a, &session, nodes[0], 1, 0);
    try probe(a, &session, nodes[1], 1, 1);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .split_anchored, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "" }));
    try probe(a, &session, nodes[0], 1, 0);
    try probe(a, &session, nodes[1], 2, 0);
    try std.testing.expect(try history.apply(&session, .{ .kind = .anchored, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "앞😀" }));
    try std.testing.checkAllAllocationFailures(a, probe, .{ &session, nodes[1], 2, 3 });
    try std.testing.expect(try history.apply(&session, .{ .kind = .merge, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" }));
    try probe(a, &session, nodes[0], 1, 0);
    try probe(a, &session, nodes[1], 1, 4);
    try std.testing.expect(try history.undo(&session));
    try probe(a, &session, nodes[1], 2, 3);
    try std.testing.expect(try history.redo(&session));
    try probe(a, &session, nodes[1], 1, 4);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
}
test "HWPX joined line host follows protected ownership through source merge and split" {
    const allocator = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(allocator, "<p:p id='1'><p:run><p:t>A</p:t><p:line/></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t><p:line/></p:run></p:p>");
    defer allocator.free(bytes);
    var session = try @import("editor_session.zig").open(allocator, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var last_line: ?usize = null;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "line")) {
        last_line = index;
    };
    const node = last_line orelse return error.MissingLine;
    try std.testing.expect(try session.mergeParagraph(0, 1));
    var values = &session.sections[0].structure_values.?;
    const display = @import("line_display_host.zig");
    try std.testing.expectEqual(@as(usize, 1), try display.currentOrdinal(tree, values.paragraphs, 1, node));
    try std.testing.expectEqual(@as(usize, 3), try display.anchorUnit(allocator, tree, &values.paragraphs[0], node));
    try std.testing.expect(try session.splitParagraphAnchored(0, 1, 2, 0));
    values = &session.sections[0].structure_values.?;
    try std.testing.expectEqual(@as(usize, 2), try display.currentOrdinal(tree, values.paragraphs, 1, node));
    try std.testing.expectEqual(@as(usize, 1), try display.anchorUnit(allocator, tree, &values.paragraphs[1], node));
}
