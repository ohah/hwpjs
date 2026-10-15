const std = @import("std");
const host = @import("connector_display_host.zig");
const editor = @import("editor_session.zig");
fn probe(a: std.mem.Allocator, session: *const editor.Session, node: usize, ordinal: usize, unit: usize) !void {
    const section = &session.sections[2];
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    try std.testing.expectEqual(ordinal, try host.currentOrdinal(&section.tree, view.paragraphs, section.first_paragraph, node));
    try std.testing.expectEqual(unit, try host.anchorUnit(a, &section.tree, &view.paragraphs[ordinal - section.first_paragraph], node));
}
test "connector display host actual four connectors follow Unicode input undo and redo" {
    try @import("../testing/checked_allocator.zig").run(run, .{});
}
fn run(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx", a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const nodes = try @import("connector_geometry_source.zig").nodes(a, &session.sections[2].tree, 100);
    defer a.free(nodes);
    try std.testing.expectEqual(@as(usize, 4), nodes.len);
    for (nodes, 0..) |node, unit| try probe(a, &session, node, 1559, unit);
    var history = try @import("editor_history.zig").History.init(&session, 8, 16 * 1024 * 1024);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .anchored, .section = 2, .paragraph = 1559, .start = 0, .deleted = 0, .inserted = "앞😀" }));
    for (nodes, 0..) |node, unit| try probe(a, &session, node, 1559, unit + 3);
    try std.testing.expect(try history.undo(&session));
    for (nodes, 0..) |node, unit| try probe(a, &session, node, 1559, unit);
    try std.testing.expect(try history.redo(&session));
    for (nodes, 0..) |node, unit| try probe(a, &session, node, 1559, unit + 3);
}
