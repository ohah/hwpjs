//! Detached batch preparation: no live publication or external document fixture.
const std = @import("std");
const batch = @import("created_cell_text_batch.zig");
const editor = @import("editor_session.zig");
const a = std.testing.allocator;
fn groups(identity: u64) [2]batch.Group {
    return .{
        .{ .section = 0, .identity = identity, .row = 0, .column = 0, .before_units = 6, .edits = &.{.{ .start = 0, .end = 6, .text = "한😀", .expected = "needle" }} },
        .{ .section = 0, .identity = identity, .row = 0, .column = 1, .before_units = 6, .edits = &.{.{ .start = 0, .end = 6, .text = "둘", .expected = "needle" }} },
    };
}
fn prepareCase(allocator: std.mem.Allocator, session: *const editor.Session, identity: u64) !void {
    var candidate = try batch.prepare(allocator, session, &groups(identity));
    defer candidate.deinit();
    try std.testing.expectEqualStrings("한😀", candidate.sections[0].?.values.entries.items[0].table.cells[0].text);
    try std.testing.expectEqualStrings("둘", candidate.sections[0].?.values.entries.items[0].table.cells[1].text);
    try candidate.validateCurrent(session);
}
test "document text HX pending cell batch owns all candidates without publishing through OOM" {
    const fixture = try @import("document_text_test_fixture.zig").Fixture.create(a, 2);
    defer fixture.deinit();
    const before = try fixture.session.save();
    defer a.free(before);
    const revision = fixture.history.revision();
    try prepareCase(a, &fixture.session, fixture.table_identity);
    try @import("../testing/allocation_failures.zig").check(prepareCase, .{ &fixture.session, fixture.table_identity });
    const after = try fixture.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(revision, fixture.history.revision());
    try std.testing.expectEqualStrings("needle", fixture.session.sections[0].created_tables.entries.items[0].table.cells[0].text);
}
test "document text HX pending batch refuses late mismatch duplicate and invalid Unicode atomically" {
    const fixture = try @import("document_text_test_fixture.zig").Fixture.create(a, 2);
    defer fixture.deinit();
    const before = try fixture.session.save();
    defer a.free(before);
    var input = groups(fixture.table_identity);
    input[1].edits = &.{.{ .start = 0, .end = 6, .text = "late", .expected = "absent" }};
    try std.testing.expectError(error.ExpectedTextMismatch, batch.prepare(a, &fixture.session, &input));
    input = groups(fixture.table_identity);
    input[1].column = 0;
    try std.testing.expectError(error.DuplicateTextTransactionTarget, batch.prepare(a, &fixture.session, &input));
    input = groups(fixture.table_identity);
    input[1].edits = &.{.{ .start = 0, .end = 6, .text = "\x00", .expected = "needle" }};
    try std.testing.expectError(error.InvalidXmlCharacter, batch.prepare(a, &fixture.session, &input));
    input = groups(fixture.table_identity);
    input[1].before_units = 5;
    try std.testing.expectError(error.TextTransactionBeforeMismatch, batch.prepare(a, &fixture.session, &input));
    const after = try fixture.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
