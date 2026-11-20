//! Complete Native read observation: current model + canonical pending emission.
const std = @import("std");
const editor = @import("editor_session.zig");
const lifetime_mod = @import("../model/formatting_binding.zig");
const snapshot_mod = @import("document_text_snapshot.zig");
const a = std.testing.allocator;
fn completeCase(allocator: std.mem.Allocator, original: *const editor.Session, lifetime: lifetime_mod.State, revision: u32) !void {
    // Read-only borrowed model, with ALL temporary read/save/open allocations
    // routed through the tested provider. Never deinit or publish this proxy.
    var reader = original.*;
    reader.allocator = allocator;
    var observation = try snapshot_mod.observe(allocator, &reader, lifetime, revision);
    defer observation.deinit();
    const snapshot = &observation.snapshot;
    try std.testing.expectEqual(@as(usize, 0), observation.pending_positions[0][0].len);
    try std.testing.expectEqualSlices(u32, &.{2}, observation.pending_positions[0][1]);
    try std.testing.expectEqual(@as(usize, 4), snapshot.rows.items.len);
    try std.testing.expectEqualStrings("needle", snapshot.rows.items[0].text);
    try std.testing.expectEqualStrings("😀\xef\xbf\xbc", snapshot.rows.items[1].text);
    try std.testing.expect(snapshot.rows.items[2].source == .created_cell);
    try std.testing.expect(snapshot.rows.items[3].source == .created_cell);
    try std.testing.expectEqualStrings("needle", snapshot.rows.items[2].text);
    try std.testing.expectEqualStrings("needle", snapshot.rows.items[3].text);
    var plan = try @import("../model/document_replace_all.zig").prepare(allocator, snapshot, .{
        .binding = snapshot.binding,
        .query = "needle",
        .replacement = "한",
    });
    defer plan.deinit();
    try std.testing.expectEqual(@as(u32, 3), plan.match_count);
    try std.testing.expectEqual(@as(usize, 3), plan.groups.len);
    const bytes = try snapshot.encode(allocator);
    defer allocator.free(bytes);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "\"complete\":true") != null);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "\"source\"") == null);
}

test "document text HX complete Native snapshot searches original generated and pending owners through allocation failures" {
    const fixture = try @import("document_text_test_fixture.zig").Fixture.create(a, 2);
    defer fixture.deinit();
    var lifetime: lifetime_mod.State = .{};
    try lifetime.open();
    const before = try fixture.session.save();
    defer a.free(before);
    const revision = fixture.history.revision();
    try completeCase(a, &fixture.session, lifetime, revision);
    try @import("../testing/allocation_failures.zig").check(completeCase, .{
        @as(*const editor.Session, &fixture.session), lifetime, revision,
    });
    const after = try fixture.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(revision, fixture.history.revision());
    try std.testing.expectEqual(@as(usize, 1), fixture.session.sections[0].created_tables.entries.items.len);
}

test "document text HX readonly observation has null Native revision and no transaction authority" {
    const fixture = try @import("document_text_test_fixture.zig").Fixture.create(a, 2);
    defer fixture.deinit();
    var reader = fixture.session;
    reader.history_delta_managed = false;
    var lifetime: lifetime_mod.State = .{};
    try lifetime.open();
    var snapshot = try snapshot_mod.read(a, &reader, lifetime, null);
    defer snapshot.deinit();
    try std.testing.expect(snapshot.binding.revision == null);
    try std.testing.expectEqual(@as(usize, 4), snapshot.rows.items.len);
    try std.testing.expectError(error.StaleDocumentTextReference, @import("../model/document_replace_all.zig").prepare(a, &snapshot, .{
        .binding = snapshot.binding,
        .query = "needle",
        .replacement = "한",
    }));
    try std.testing.expectEqual(@as(usize, 1), fixture.session.sections[0].created_tables.entries.items.len);
}
