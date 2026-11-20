const std = @import("std");
const editor = @import("editor_session.zig");
const fixtures = @import("note_delete_fixtures.zig");
const current = @import("note_delete_current.zig");
const placement = @import("inline_object_placement.zig");
const histories = @import("editor_history.zig");
const a = std.testing.allocator;
fn lifecycle(allocator: std.mem.Allocator, input: []const u8) !void {
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var h = try histories.History.initV2(&session, .{});
    defer h.deinit();
    const before = try session.save();
    defer allocator.free(before);
    const sites = try @import("note_reference_sites.zig").read(allocator, &session, 0);
    defer allocator.free(sites);
    try std.testing.expectEqual(@as(usize, 1), sites.len);
    const site = sites[0];
    var observed = try placement.current(&session, .{ .section = 0, .paragraph = site.paragraph }, .{ .session = "s1", .revision = h.revision(), .serial = "0" });
    defer observed.deinit(allocator);
    const target: @import("inline_object_insert.zig").Target = .{ .section = 0, .paragraph = site.paragraph, .unit = @intCast(site.anchor_unit), .expected_text = observed.text, .owner = observed.owner };
    const request = try current.observe(&session, target, h.revision());
    const revision = h.revision();
    const count = h.revisionCount();
    try std.testing.expect(try h.apply(&session, .{ .kind = .note_delete, .section = 0, .paragraph = request.paragraph, .start = @intCast(request.anchor_unit), .deleted = 0, .inserted = "", .note_delete = &request }));
    try std.testing.expect(h.revision() != revision);
    try std.testing.expectEqual(count + 1, h.revisionCount());
    const after = try session.save();
    defer allocator.free(after);
    var reopened = try editor.open(allocator, after, .{});
    defer reopened.deinit();
    const remaining = try @import("note_reference_sites.zig").read(allocator, &reopened, 0);
    defer allocator.free(remaining);
    try std.testing.expectEqual(@as(usize, 0), remaining.len);
    const saved = try reopened.save();
    defer allocator.free(saved);
    try std.testing.expectEqualSlices(u8, after, saved);
    try std.testing.expect(try h.undo(&session));
    const undone = try session.save();
    defer allocator.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try h.redo(&session));
    const redone = try session.save();
    defer allocator.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "HWPX N02 public delete current footnote uses one owned edge undo redo reopen" {
    const bytes = try fixtures.create(a, fixtures.foot, fixtures.continuous);
    defer a.free(bytes);
    try lifecycle(a, bytes);
}
test "HWPX N02 public delete current endnote uses one owned edge undo redo reopen" {
    const bytes = try fixtures.create(a, fixtures.end, fixtures.continuous);
    defer a.free(bytes);
    try lifecycle(a, bytes);
}
test "HWPX N02 public delete current literal UFFFC cannot stand in for reference" {
    const bytes = try fixtures.create(a, "<hp:t>\xef\xbf\xbc😀</hp:t>", fixtures.continuous);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var observed = try placement.current(&session, .{ .section = 0, .paragraph = 1 }, .{ .session = "s1", .revision = 0, .serial = "0" });
    defer observed.deinit(a);
    const target: @import("inline_object_insert.zig").Target = .{ .section = 0, .paragraph = 1, .unit = 0, .expected_text = observed.text, .owner = observed.owner };
    try std.testing.expectError(error.MissingNoteDeleteOwner, current.observe(&session, target, 0));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, bytes, after);
}
test "HWPX N02 public delete current mismatched witness refuses before mutation" {
    const bytes = try fixtures.create(a, fixtures.foot, fixtures.continuous);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var observed = try placement.current(&session, .{ .section = 0, .paragraph = 1 }, .{ .session = "s1", .revision = 0, .serial = "0" });
    defer observed.deinit(a);
    const target: @import("inline_object_insert.zig").Target = .{ .section = 0, .paragraph = 1, .unit = 0, .expected_text = "stale", .owner = observed.owner };
    try std.testing.expectError(error.SourceBindingMismatch, current.observe(&session, target, 0));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, bytes, after);
}
test "HWPX N02 public delete current NoResize lifecycle cleanup" {
    const bytes = try fixtures.create(a, fixtures.foot, fixtures.continuous);
    defer a.free(bytes);
    try @import("../testing/allocation_failures.zig").check(lifecycle, .{bytes});
}
