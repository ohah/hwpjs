//! Proposal tests: only compile after Main applies the history integration patch.
//! Authored empty package; no real fixture or SDK dependency.
const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
const api = @import("chart_create.zig");

test "HWPX chart create proposal one parked history edge save undo redo reopen" {
    const a = std.testing.allocator;
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const before = try session.save();
    defer a.free(before);
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(before, &hash, .{});
    const request: api.Request = .{
        .expected_source_sha256 = hash,
        .target = .{ .section = 0, .paragraph = 1, .unit = 0, .expected_text = "" },
        .size = .{ .width = 21600, .height = 14400 },
        .data = .{ .categories = &.{ "A", "B" }, .series = &.{.{ .name = "S", .values = &.{ "1", "-2" } }} },
    };
    const revision = history.revision();
    try std.testing.expect(try history.apply(&session, .{ .kind = .chart_create, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "", .chart_create = &request }));
    try std.testing.expect(history.revision() != revision);
    const created = try session.save();
    defer a.free(created);
    var reopened = try editor.open(a, created, .{});
    defer reopened.deinit();
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, created, resaved);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, created, redone);
    try std.testing.expect(try history.undo(&session));
    const rejected_revision = history.revision();
    const rejected_serial = session.mutation_serial;
    const rejected_pointer = session.source.ptr;
    var stale = request;
    stale.expected_source_sha256[0] ^= 1;
    try std.testing.expectError(error.SourceHashMismatch, history.apply(&session, .{ .kind = .chart_create, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "", .chart_create = &stale }));
    try std.testing.expectEqual(rejected_revision, history.revision());
    try std.testing.expectEqual(rejected_serial, session.mutation_serial);
    try std.testing.expectEqual(rejected_pointer, session.source.ptr);
    // A rejected creation must retain the prior redo edge.
    try std.testing.expect(try history.redo(&session));
    const after_rejection = try session.save();
    defer a.free(after_rejection);
    try std.testing.expectEqualSlices(u8, created, after_rejection);
}
