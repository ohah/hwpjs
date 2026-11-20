//! Native source contracts only until a dedicated execution grant is supplied.
//! Synthetic current model plus pending cells; no external file fixtures.
const std = @import("std");
const editor = @import("editor_session.zig");
const inventory = @import("document_text_inventory.zig");
const a = std.testing.allocator;

test "document text HX owner catalogue retains generated paragraph pending cell and readonly provenance" {
    const fixture = try @import("document_text_test_fixture.zig").Fixture.create(a, 1);
    defer fixture.deinit();
    const session = &fixture.session;
    const history = &fixture.history;
    var read = try inventory.read(a, session);
    defer read.deinit();
    try std.testing.expectEqual(@as(u32, 3), read.coverage.paragraphs);
    try std.testing.expectEqual(@as(u32, 1), read.coverage.created_cell_paragraphs);
    try std.testing.expectEqual(@as(usize, 2), read.sections[0].sources.len);
    try std.testing.expectEqualStrings("needle", read.sections[0].sources[0].text);
    try std.testing.expectEqualStrings("😀", read.sections[0].sources[1].text);
    try std.testing.expect(read.sections[0].sources[1].reference == .generated_id);
    try std.testing.expectEqualStrings("needle", read.sections[0].cells[0].text);
    try std.testing.expectEqual(@as(usize, 1), read.sections[0].cells[0].host_index);
    try std.testing.expectEqual(@as(u32, 2), read.sections[0].cells[0].anchor.unit);
    try read.assertCurrent(session);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, live: *const editor.Session) !void {
            var observed = try inventory.read(allocator, live);
            defer observed.deinit();
            try std.testing.expectEqual(@as(u32, 3), observed.coverage.paragraphs);
            try std.testing.expectEqualStrings("needle", observed.sections[0].cells[0].text);
        }
    }.run, .{session});
    try std.testing.expect(try history.apply(session, .{ .kind = .created_cell_text, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "changed", .created_table_identity = fixture.table_identity, .created_cell = .{ 0, 0 } }));
    try std.testing.expectError(error.StaleDocumentTextSnapshot, read.assertCurrent(session));
    try std.testing.expectEqualStrings("needle", read.sections[0].cells[0].text);
    try std.testing.expect(try history.undo(session));
    try std.testing.expectError(error.StaleDocumentTextSnapshot, read.assertCurrent(session));
    var after_undo = try inventory.read(a, session);
    defer after_undo.deinit();
    try std.testing.expectEqualStrings("needle", after_undo.sections[0].cells[0].text);
}
